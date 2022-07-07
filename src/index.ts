import { CfnOutput, Duration, RemovalPolicy } from "aws-cdk-lib";
import { DnsValidatedCertificate } from "aws-cdk-lib/aws-certificatemanager";
import {
  AllowedMethods,
  Distribution,
  experimental,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  LambdaEdgeEventType,
  OriginAccessIdentity,
  ResponseHeadersPolicy,
  SecurityPolicyProtocol,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { S3Origin } from "aws-cdk-lib/aws-cloudfront-origins";
import { CanonicalUserPrincipal, PolicyStatement } from "aws-cdk-lib/aws-iam";
import {
  ARecord,
  HostedZone,
  IHostedZone,
  RecordTarget,
} from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import { BlockPublicAccess, Bucket } from "aws-cdk-lib/aws-s3";
import { BucketDeployment, ISource } from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";
export interface ReactWebsiteProps {
  /**
   * The domain name of the website.
   */
  readonly domainName: string;

  /**
   * The built react source code to deploy.
   */
  readonly sourceAsset: ISource;

  /**
   * If not specified, it will default to a strict and secure CSP that will score
   * well on https://observatory.mozilla.org/.
   */
  readonly responseHeaderPolicy?: ResponseHeadersPolicy;

  /**
   * An optional edge function to transform S3 responses. This is useful
   * for doing things like injecting metatags for search optimizations.
   */
  readonly edgeOriginRequestFunction?: experimental.EdgeFunction;

  /**
   * Policy for deleting resources. Defaults to destroy.
   */
  readonly removalPolicy?: RemovalPolicy;
}

/**
 * A construct to create a secure single page application react website.
 */
export class ReactWebsiteConstruct extends Construct {
  constructor(scope: Construct, id: string, props: ReactWebsiteProps) {
    super(scope, id);
    constructConstructsFromProps(this, props);
  }
}

/**
 * @deprecated
 *
 * This function is not meant to be used by others. For Pinegraph, reorganizing
 * resources into constructs causes the logical ids to change. See https://github.com/aws/aws-cdk-rfcs/issues/162.
 *
 * New users should use the constructor approach of `new ReactWebsiteConstruct(this, "ReactWebsiteConstruct", {...}`
 */
export function constructConstructsFromProps(
  self: Construct,
  props: ReactWebsiteProps
) {
  const domain = props.domainName;
  const allDomainNames = [domain];

  const zones: { [name: string]: IHostedZone } = {};
  for (const d of allDomainNames) {
    const resourceId = getResourceId(d, "Zone");
    zones[d] = HostedZone.fromLookup(self, resourceId, {
      domainName: domain,
    });
  }
  const cloudfrontOAI = new OriginAccessIdentity(self, "cloudfront-OAI", {
    comment: `OAI for ${domain}`,
  });

  new CfnOutput(self, "Site", { value: "https://" + domain });

  // Content bucket
  const siteBucket = new Bucket(self, "SiteBucket", {
    bucketName: domain,
    publicReadAccess: false,
    blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    removalPolicy: props.removalPolicy,
    autoDeleteObjects: props.removalPolicy === RemovalPolicy.DESTROY,
  });
  // Grant access to cloudfront
  siteBucket.addToResourcePolicy(
    new PolicyStatement({
      actions: ["s3:GetObject"],
      resources: [siteBucket.arnForObjects("*")],
      principals: [
        new CanonicalUserPrincipal(
          cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId
        ),
      ],
    })
  );
  new CfnOutput(self, "Bucket", { value: siteBucket.bucketName });

  // TLS certificate
  const certificate = new DnsValidatedCertificate(self, "SiteCertificate", {
    domainName: domain,
    subjectAlternativeNames: allDomainNames,
    hostedZone: zones[domain],
    region: "us-east-1", // Cloudfront only checks this region for certificates.
  });
  new CfnOutput(self, "Certificate", { value: certificate.certificateArn });
  const responseHeaderPolicy =
    props.responseHeaderPolicy ||
    new ResponseHeadersPolicy(self, "SecurityHeadersResponsePolicy", {
      comment: "Security headers response policy",
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          override: true,
          contentSecurityPolicy: `default-src 'self';`,
        },
        strictTransportSecurity: {
          override: true,
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          preload: true,
        },
        contentTypeOptions: {
          override: true,
        },
        referrerPolicy: {
          override: true,
          referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
        },
        xssProtection: {
          override: true,
          protection: true,
          modeBlock: true,
        },
        frameOptions: {
          override: true,
          frameOption: HeadersFrameOption.DENY,
        },
      },
    });

  // CloudFront distribution
  const distribution = new Distribution(self, "SiteDistribution", {
    certificate: certificate,
    domainNames: allDomainNames,
    comment: props.domainName,
    minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2016,
    defaultBehavior: {
      origin: new S3Origin(siteBucket, {
        originAccessIdentity: cloudfrontOAI,
      }),
      edgeLambdas: props.edgeOriginRequestFunction
        ? [
            {
              functionVersion: props.edgeOriginRequestFunction.currentVersion,
              eventType: LambdaEdgeEventType.ORIGIN_REQUEST,
            },
          ]
        : [],
      compress: true,
      allowedMethods: AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
      viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      responseHeadersPolicy: responseHeaderPolicy,
    },

    /**
     * This ensures that all routes end up using index.html for client side rendering.
     */
    errorResponses: [
      {
        httpStatus: 403,
        responseHttpStatus: 200,
        responsePagePath: "/index.html",
      },
    ],
    defaultRootObject: "index.html",
  });

  new CfnOutput(self, "DistributionId", {
    value: distribution.distributionId,
  });

  // Route53 alias record for the CloudFront distribution]
  for (const d of allDomainNames) {
    const resourceId = getResourceId(d, "SiteAliasRecord");
    new ARecord(self, resourceId, {
      recordName: d,
      target: RecordTarget.fromAlias(new CloudFrontTarget(distribution)),
      zone: zones[d],
    });
  }

  // Deploy site contents to S3 bucket
  new BucketDeployment(self, "DeployWithInvalidation", {
    sources: [props.sourceAsset],
    destinationBucket: siteBucket,
    distribution,
    distributionPaths: ["/*"],
  });
}

function capitalizeFirstLetter(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * A simple function to make the resource id human readable.
 */
function getResourceId(domain: string, resourceType: string) {
  if (!domain.includes(".")) {
    return resourceType;
  }
  return capitalizeFirstLetter(`${domain.split(".")[0]}${resourceType}`);
}

<div align="center">
  <br />
  <p>
    <a href="https://pinegraph.com/"><img src="https://pinegraph.com/img/favicon.ico" width="100px"/></a>
  </p>
  <br />
  <p>
    <a href="https://discord.gg/MVEUBBX2vB"><img src="https://img.shields.io/discord/955641113673347193?color=5865F2&logo=discord&logoColor=white" alt="Discord server" /></a>
    <a href="https://www.npmjs.com/package/@pinegraph/react-website-cdk-constructs"><img src="https://img.shields.io/npm/v/@pinegraph/react-website-cdk-constructs.svg?maxAge=3600" alt="npm version" /></a>
  </p>
</div>

# React Website Constructs

## What is this?

This package is an [AWS CDK construct](https://aws.amazon.com/cdk/) for hosting a secure react website. It sets up HTTPs Certificates, S3 (for storing your assets), Cloudfront (a CDN for caching resources and speeding up delivery), and DNS records.

AWS CDK enables people to have infrastructure as code (IAC). That is, with just a few commands, you'll have a fully running and functional production ready service in the cloud.

## Problem

There are 2 problems. Firstly, it's hard to setup hosting a website even with popular cloud based technologies. Second, it's hard to setup a secure website. People often forget to enable secure headers to prevent XSS, clickjacking, and encryption in transit.

## Benefits

By using this construct, you'll get a secure website that you can spin up in seconds.

## Setup

1. This package assummes that you are familiar with AWS CDK and already have a CDK app created. If not, follow [this tutorial](https://docs.aws.amazon.com/cdk/v2/guide/hello_world.html).
2. Go to the AWS console and register the domain you want. This can be done in the [Route 53 console](https://us-east-1.console.aws.amazon.com/route53/home#DomainListing:) and requires you to verify multiple emails.
3. Once you have a CDK app ready and a dmoain, create a new stack or modify an existing one to include the `ReactWebsiteConstruct`. See the `Example CDK App Code` below.
4. Deploy your change via `cdk deploy`.
5. Go to your website and voila!

## Example CDK App Code

```
new ReactWebsiteConstruct(this, "ReactWebsiteConstruct", {
  domainName: props.domainName,
  sourceAsset: s3deploy.Source.asset("../Website/build")
}
```

## Questions?

Reach out to us on [discord](https://discord.gg/MVEUBBX2vB).

## Releasing

1. `npm run build`
2. `npm publish --access public`

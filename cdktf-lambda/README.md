# How to use

## Compile and package the lambda

- cd lambdas/hello
- npm i
- npm run zip

Now you have a zip file ready to be deployed on lambda

## Deploy the infrastructure with CDKTF

### Install cdktf

- npm install --global cdktf-cli

### Deploy the infrastructue

- cd infra
- npm i
- cdktf get
- npm run build
- cdktf deploy
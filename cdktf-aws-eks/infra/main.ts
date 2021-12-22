import { Construct } from "constructs";
import { App, Fn, TerraformStack, S3Backend, TerraformOutput } from "cdktf";
import * as aws from "@cdktf/provider-aws";
import * as k8s from "@cdktf/provider-kubernetes"

import { Vpc } from './.gen/modules/vpc';
import * as tls from './.gen/providers/tls';

import { clusterConfig } from '../config/cluster'
import { INGRESS_CONTROLER_POLICY } from "./iam_policy";

const REGION = 'eu-west-1'
const CLUSTER_NAME = 'test-cluster';

const EKS_ASSUME_ROLE_POLICY = {
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "eks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}

const EKS_EC2_PODS_EXECUTION_ASSUME_ROLE_POLICY = {
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ec2.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}

const EKS_FARGATE_PODS_EXECUTION_ASSUME_ROLE_POLICY = {
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "eks-fargate-pods.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
const PUT_CW_METRICS_POLICY = {
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": [
        "cloudwatch:PutMetricData"
      ],
      "Resource": "*",
      "Effect": "Allow"
    }
  ]
}

const STS_ALLOW_POLICY = {
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Resource": "*"
    }
  ]
}

class EksInfraStack extends TerraformStack {
  constructor(scope: Construct, name: string) {
    super(scope, name);

    new aws.AwsProvider(this, "aws", {
      region: REGION,
    });

    new tls.TlsProvider(this, "tls")

    new S3Backend(this, {
      bucket: 's3-deployments-061161181198-eu-west-1',
      key: `trfstate/${name}/${REGION}`,
      region: REGION,
      dynamodbTable: 'tf-state-lock'

    })

    const vpc = new Vpc(this, 'EksVpc', {
      name: 'eks-vpc',
      cidr: '10.0.0.0/16',
      azs: ['eu-west-1a', 'eu-west-1b', 'eu-west-1c'],
      privateSubnets: ['10.0.1.0/24', '10.0.2.0/24', '10.0.3.0/24'],
      publicSubnets: ['10.0.101.0/24', '10.0.102.0/24', '10.0.103.0/24'],
      enableNatGateway: true,
      singleNatGateway: true,
      publicSubnetTags: {
        'usage': 'eks',
        'type': 'public',
        [`kubernetes.io/cluster/${CLUSTER_NAME}`]: 'shared',
        'kubernetes.io/role/elb': '1'
      },
      privateSubnetTags: {
        'usage': 'eks',
        'type': 'private',
        [`kubernetes.io/cluster/${CLUSTER_NAME}`]: 'shared',
        'kubernetes.io/role/internal-elb': '1'
      }
    })

    const subnetIds = new aws.vpc.DataAwsSubnetIds(this, 'subnets-ids', {
      dependsOn: [vpc],
      vpcId: vpc.vpcIdOutput,
    })

    const pivrateSubnetIds = new aws.vpc.DataAwsSubnetIds(this, 'private-subnets-ids', {
      dependsOn: [vpc],
      vpcId: vpc.vpcIdOutput,
      tags: {
        'type': 'private'
      }
    })

    // AWS EKS Cluster Role
    const eksRole = new aws.iam.IamRole(this, 'eks-cluster-role', {
      name: 'role-eks-cluster',
      assumeRolePolicy: JSON.stringify(EKS_ASSUME_ROLE_POLICY),
      managedPolicyArns: [
        'arn:aws:iam::aws:policy/AmazonEKSClusterPolicy',
        'arn:aws:iam::aws:policy/AmazonEKSVPCResourceController'
      ],
      inlinePolicy: [
        {
          name: 'AmazonEKSClusterCloudWatchMetricsPolicy',
          policy: JSON.stringify(PUT_CW_METRICS_POLICY)
        }
      ]
    })

    const eksCluster = new aws.eks.EksCluster(this, 'eks-cluster', {
      dependsOn: [vpc],
      name: 'test-cluster',
      roleArn: eksRole.arn,
      vpcConfig: {
        subnetIds: subnetIds.ids
      },
      enabledClusterLogTypes: ["api", "audit", "authenticator", "controllerManager", "scheduler"]
    })

    const clusterCertificate = new tls.DataTlsCertificate(this, 'cluster-certificate', {
      url: Fn.lookup(Fn.one(eksCluster.identity('0').oidc), 'issuer', 'https://no_found')
    })

    // Create OIDC provider for the cluster
    const clusterOidcProvider = new aws.iam.IamOpenidConnectProvider(this, 'iam-eks-oidc', {
      dependsOn: [eksCluster],
      url: Fn.lookup(Fn.one(eksCluster.identity('0').oidc), 'issuer', 'https://no_found'),
      clientIdList: ['sts.amazonaws.com'],
      thumbprintList: [clusterCertificate.certificates('0').sha1Fingerprint]
    })



    // AWS EKS Pod execution roles
    const fargatePodsExecutionRole = new aws.iam.IamRole(this, 'fargate-pods-execution-role', {
      name: 'role-eks-fargate-pods-execution',
      assumeRolePolicy: JSON.stringify(EKS_FARGATE_PODS_EXECUTION_ASSUME_ROLE_POLICY),
      managedPolicyArns: [
        'arn:aws:iam::aws:policy/AmazonEKSFargatePodExecutionRolePolicy',
        'arn:aws:iam::aws:policy/AmazonEKSVPCResourceController',
      ],
      inlinePolicy: [
        {
          name: 'STSAllowPolicy',
          policy: JSON.stringify(STS_ALLOW_POLICY)
        }
      ]
    })

    const ec2PodsExecutionRole = new aws.iam.IamRole(this, 'ec2-pods-execution-role', {
      name: 'role-eks-ec2-pods-execution',
      assumeRolePolicy: JSON.stringify(EKS_EC2_PODS_EXECUTION_ASSUME_ROLE_POLICY),
      managedPolicyArns: [
        'arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy',
        'arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy',
        'arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly'
      ],
      inlinePolicy: [
        {
          name: 'STSAllowPolicy',
          policy: JSON.stringify(STS_ALLOW_POLICY)
        }
      ]
    })

    new aws.eks.EksNodeGroup(this, 'cluster-node-group', {
      clusterName: eksCluster.name,
      nodeRoleArn: ec2PodsExecutionRole.arn,
      nodeGroupName: 'cluster-node-group',
      subnetIds: pivrateSubnetIds.ids,
      scalingConfig: {
        desiredSize: 2,
        maxSize: 2,
        minSize: 2
      },
      instanceTypes: ['m6g.medium'],
      amiType: 'BOTTLEROCKET_ARM_64'
    })

    // AWS Load balancer role for SA
    const albSaAssumeRolePolicy = new aws.iam.DataAwsIamPolicyDocument(this, `assume-role-policy-alb-sa`, {
      statement: [{
        actions: [
          "sts:AssumeRoleWithWebIdentity"
        ],
        effect: "Allow",
        principals: [
          {
            identifiers: [clusterOidcProvider.arn],
            type: 'Federated'
          }
        ],
        condition: [{
          test: "StringEquals",
          variable: `${Fn.replace(clusterOidcProvider.url, "https://", "")}:sub`,
          values: [`system:serviceaccount:kube-system:aws-load-balancer-controller-sa`]
        }]
      }]
    })

    new aws.iam.IamRole(this, `role-aws-load-balancer-controller-sa`, {
      name: `role-aws-load-balancer-controller-sa`,
      assumeRolePolicy: albSaAssumeRolePolicy.json,
      inlinePolicy: [
        {
          name: 'IngressControlerPolicy',
          policy: JSON.stringify(INGRESS_CONTROLER_POLICY)
        }
      ]

    })

    // Create 1 Fargate profile and role per Application
    clusterConfig.applications.map(app => {

      new aws.eks.EksFargateProfile(this, `fargate-profile-${app}`, {
        clusterName: eksCluster.name,
        fargateProfileName: `${app}-profile`,
        podExecutionRoleArn: fargatePodsExecutionRole.arn,
        subnetIds: pivrateSubnetIds.ids,
        selector: [
          {
            namespace: `${app}-ns`
          }
        ],
      })

      // AWS EKS Cluster Role
      const eksSaAssumeRolePolicy = new aws.iam.DataAwsIamPolicyDocument(this, `assume-role-policy-${app}-sa`, {
        statement: [{
          actions: [
            "sts:AssumeRoleWithWebIdentity"
          ],
          effect: "Allow",
          principals: [
            {
              identifiers: [clusterOidcProvider.arn],
              type: 'Federated'
            }
          ],
          condition: [{
            test: "StringEquals",
            variable: `${Fn.replace(clusterOidcProvider.url, "https://", "")}:sub`,
            values: [`system:serviceaccount:${app}-ns:${app}-sa`]
          }]
        }]
      })

      new aws.iam.IamRole(this, `role-${app}-sa`, {
        name: `role-${app}-sa`,
        assumeRolePolicy: eksSaAssumeRolePolicy.json,
        inlinePolicy: [
          {
            name: 'IngressControlerPolicy',
            policy: JSON.stringify(INGRESS_CONTROLER_POLICY)
          }
        ]

      })

    })

    new TerraformOutput(this, 'cluster-endpoint', {
      value: eksCluster.endpoint
    })

    new TerraformOutput(this, 'cluster-arn', {
      value: eksCluster.arn
    })

    new TerraformOutput(this, 'cluster-id', {
      value: eksCluster.id
    })

  }
}

class EksNamespacesStack extends TerraformStack {

  constructor(scope: Construct, name: string) {
    super(scope, name);

    new aws.AwsProvider(this, "aws", {
      region: REGION,
    });

    const eksCluster = new aws.eks.DataAwsEksCluster(this, 'data-eks-cluster', {
      name: CLUSTER_NAME
    })

    const eksClusterAuth = new aws.eks.DataAwsEksClusterAuth(this, 'data-eks-auth', {
      name: CLUSTER_NAME
    })

    new k8s.KubernetesProvider(this, 'k8s-provider', {
      host: eksCluster.endpoint,
      clusterCaCertificate: Fn.base64decode(eksCluster.certificateAuthority('0').data),
      token: eksClusterAuth.token,
    })

    new S3Backend(this, {
      bucket: 's3-deployments-061161181198-eu-west-1',
      key: `trfstate/${name}/${REGION}`,
      region: REGION,
      dynamodbTable: 'tf-state-lock'

    })

    // Create 1 Fargate Namespace per Application
    clusterConfig.applications.map(app => {
      new k8s.DataKubernetesNamespace(this, `namespace-${app}`, {
        metadata: {
          name: `${app}-ns`,
        }
      })
    })

  }
}

const app = new App();

const infraStack = new EksInfraStack(app, "aws-eks-infra");
const namespacesStack = new EksNamespacesStack(app, "aws-eks-namespaces");

namespacesStack.node.addDependency(infraStack);

app.synth();
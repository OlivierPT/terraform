import { Construct } from 'constructs';
import * as kplus from 'cdk8s-plus-22';
import { App, Chart, ChartProps, Helm } from 'cdk8s';

export class NginxChart extends Chart {
  constructor(scope: Construct, id: string, props: ChartProps = {}) {
    super(scope, id, props);

    const sa = new kplus.ServiceAccount(this, 'nginx-sa', {
      metadata: {
        name: 'nginx-sa',
        namespace: 'nginx-ns',
        labels: {
          'app.kubernetes.io/name': 'nginx-sa'
        },
        annotations: {
          'eks.amazonaws.com/role-arn': 'arn:aws:iam::061161181198:role/role-nginx-sa'
        }
      }
    })

    const deployment = new kplus.Deployment(this, 'nginx-deployment', {
      replicas: 3,
      metadata: {
        namespace: 'nginx-ns',
        name: 'nginx-deployment'
      },
      serviceAccount: sa,
      containers: [
        {
          image: 'nginx',
          name: 'nginx-instance',
          port: 80
        }
      ]

    })

    const service = new kplus.Service(this, 'nginx-service', {
      type: kplus.ServiceType.LOAD_BALANCER,
      metadata: {
        name: 'nginx-service',
        labels: {
          'run': 'nginx'
        },
        namespace: 'nginx-ns',
        annotations: {
          'service.beta.kubernetes.io/aws-load-balancer-type': 'external',
          'service.beta.kubernetes.io/aws-load-balancer-nlb-target-type': 'ip',
          'service.beta.kubernetes.io/aws-load-balancer-scheme': 'internet-facing'
        },

      },
      ports: [
        {
          port: 80,
          targetPort: 80,
          protocol: kplus.Protocol.TCP
        }
      ],
    })

    service.addSelector('run', 'nginx')
    service.addDeployment(deployment)
  }
}

export class OwnCloudChart extends Chart {
  constructor(scope: Construct, id: string, props: ChartProps = {}) {
    super(scope, id, props);

    const sa = new kplus.ServiceAccount(this, 'owncloud-sa', {
      metadata: {
        name: 'owncloud-sa',
        namespace: 'owncloud-ns',
        labels: {
          'app.kubernetes.io/name': 'owncloud-sa'
        },
        annotations: {
          'eks.amazonaws.com/role-arn': 'arn:aws:iam::061161181198:role/role-owncloud-sa'
        }
      }
    })

    new kplus.Deployment(this, 'owncloud-deployment', {
      replicas: 3,
      metadata: {
        namespace: 'owncloud-ns',
        name: 'owncloud-deployment',
        labels: {
          'run': 'owncloud'
        }
      },
      serviceAccount: sa,
      containers: [
        {
          image: 'owncloud',
          name: 'owncloud-instance',
          port: 80
        }
      ]

    })

    const service = new kplus.Service(this, 'owncloud-service', {
      type: kplus.ServiceType.NODE_PORT,
      metadata: {
        name: 'owncloud-service',
        labels: {
          'run': 'owncloud'
        },
        annotations: {
          'service.beta.kubernetes.io/aws-load-balancer-type': 'external',
          'service.beta.kubernetes.io/aws-load-balancer-nlb-target-type': 'ip',
          'service.beta.kubernetes.io/aws-load-balancer-scheme': 'internet-facing'
        },

      },
      ports: [
        {
          port: 80,
          targetPort: 80,
          protocol: kplus.Protocol.TCP
        }
      ],
    })

    service.addSelector('run', 'owncloud')
  }
}

export class IngressControllerChart extends Chart {
  constructor(scope: Construct, id: string, props: ChartProps = {}) {
    super(scope, id, props);

    new Helm(this, 'alb-ingress-controller', {
      chart: 'eks/aws-load-balancer-controller',
      values: {
        'clusterName': 'test-cluster',
        'serviceAccount.create': false,
        'serviceAccount.name': 'aws-load-balancer-controller-sa',
        'region': 'eu-west-1',
        'vpcId': 'vpc-023b504efa560cedb'
      }
    })
  }
}

const app = new App();
new NginxChart(app, 'nginx');
new OwnCloudChart(app, 'owncloud');
// new IngressControllerChart(app, 'ingress');

app.synth();

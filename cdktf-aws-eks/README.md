# EKS

## Deploy cluster

- cd infra
- npx cdktf-cli deploy

## Configure Kubectl

aws eks update-kubeconfig  --region eu-west-1  --name test-cluster

## Enable Fargate for  core-dns

kubectl patch deployment coredns \
    -n kube-system \
    --type json \
    -p='[{"op": "remove", "path": "/spec/template/metadata/annotations/eks.amazonaws.com~1compute-type"}]'

## Install Kubernetes Dashboard

### Metric server

kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

### Dashboard

kubectl apply -f https://raw.githubusercontent.com/kubernetes/dashboard/v2.0.5/aio/deploy/recommended.yaml

## Create EKS Admin SA and role

kubectl apply -f ../kubernetes/iam/eks-admin.yaml

## Authenticate and access

- kubectl -n kube-system describe secret $(kubectl -n kube-system get secret | grep eks-admin | awk '{print $1}')
- kubectl proxy

navigate to: http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/#!/login

## Add Ingress Controller

### Create SA

kubectl apply -f ../kubernetes/iam/alb-controller-sa.yaml

### Use Helm

- helm repo add eks https://aws.github.io/eks-charts
- helm repo update
- helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=test-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller-sa \
  --set region=eu-west-1 \
  --set vpcId=vpc-0af8839e1bfabb9a9

## Deploy services

### 2048

- kubectl apply -f ../kubernetes/services/2048_full.yaml
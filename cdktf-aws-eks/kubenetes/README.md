# EKS

aws eks update-kubeconfig  --region eu-west-1  --name test-cluster

# Fargate

## Allow core-dns to run on Fargate

kubectl patch deployment coredns \
    -n kube-system \
    --type json \
    -p='[{"op": "remove", "path": "/spec/template/metadata/annotations/eks.amazonaws.com~1compute-type"}]'
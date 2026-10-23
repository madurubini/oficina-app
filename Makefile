# Atalhos para acompanhar a aplicação no EKS. O deploy em si é do pipeline
# (push em homolog ou main); aqui ficam só consultas e a demonstração do HPA.
#   make ajuda
#
# Pré-requisitos: credenciais do Learner Lab em ~/.aws/credentials e o cluster
# no ar (repo oficina-infra-k8s). Ambiente padrão: homolog.

SHELL := /bin/bash
REGIAO    ?= us-east-1
CLUSTER   ?= oficina-eks
NAMESPACE ?= homolog

.PHONY: ajuda kubeconfig url estado logs carga sem-carga testes

ajuda: ## Lista os alvos
	@grep -E '^[a-z-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

kubeconfig: ## Aponta o kubectl para o cluster EKS
	aws eks update-kubeconfig --region $(REGIAO) --name $(CLUSTER)

url: ## Mostra a URL do Swagger e da sonda de saúde do ambiente
	@HOST=$$(kubectl get svc oficina-api -n $(NAMESPACE) -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'); \
	echo "Swagger: http://$$HOST/api/docs"; \
	echo "Saúde:   http://$$HOST/api/v1/health/ready"

estado: ## Retrato do namespace
	kubectl get all,configmap,secret,hpa -n $(NAMESPACE)

logs: ## Segue os logs da API
	kubectl logs -f -l app.kubernetes.io/name=oficina-api -n $(NAMESPACE) --max-log-requests=10

carga: ## Sobe o gerador de carga para ver o HPA escalar
	kubectl apply -f k8s/gerador-carga.yaml -n $(NAMESPACE)
	@echo "Acompanhe com: watch kubectl get hpa,pods -n $(NAMESPACE)"

sem-carga: ## Remove o gerador de carga
	kubectl delete -f k8s/gerador-carga.yaml -n $(NAMESPACE) --ignore-not-found

testes: ## Lint + unitários com cobertura + e2e
	npm run lint && npm run test:cov && npm run test:e2e

# Linguagem Ubíqua — Sistema Integrado de Atendimento e Execução de Serviços (Oficina)

Vocabulário compartilhado entre negócio e código. Todo termo aqui deve aparecer com o **mesmo nome** no Event Storming, no código (classes, métodos, eventos) e nas conversas. Está em português porque o domínio é falado em português; só o que for convenção técnica universal fica em inglês.

Legenda de tipo: **AG** agregado · **EN** entidade · **VO** objeto de valor · **CMD** comando · **EV** evento · **POL** política · **ML** read model · **AT** ator · **SE** sistema externo · **PA** ponto de atenção.

---

## Atores e sistemas externos

| Termo | Tipo | Definição |
|---|---|---|
| Cliente | AT | Dono do veículo. Solicita o atendimento e, pelo aplicativo, aprova ou recusa orçamentos e reparos adicionais. |
| Recepcionista | AT | Atende o cliente, abre a OS, lida com o fornecedor (cotação/encomenda) e faz a entrega. |
| Mecânico | AT | Executa o diagnóstico, registra serviços e peças, verifica e retira peças do estoque, executa e conclui o reparo. |
| Sistema | AT | Executor das ações automáticas disparadas por política (gerar orçamento, mudar status, reenviar notificação, registrar tempo). |
| Fornecedor | SE | Sistema externo que recebe pedidos de cotação e de encomenda de peças. |
| Serviço de Notificações | SE | Canal externo (app/e-mail) que avisa o cliente sobre orçamento, reparo adicional e retirada do veículo. |

---

## Contexto: Clientes e Veículos  (AG: Clientes e Veículos)

| Termo | Tipo | Definição |
|---|---|---|
| Cliente | EN (raiz) | Pessoa física ou jurídica identificada pelo documento. Possui um ou mais veículos. |
| Veículo | EN (raiz) | Carro do cliente, identificado pela placa; tem marca, modelo e ano. Referencia o cliente dono. |
| CPF/CNPJ | VO | Documento do cliente, validado quanto a formato e dígitos. Único no sistema. |
| Placa | VO | Identificador do veículo, validado quanto a formato. Única no sistema. |
| Identificar cliente | CMD | Buscar o cliente pelo documento. |
| Cadastrar cliente | CMD | Criar o cliente quando não existe. |
| Cadastrar veículo | CMD | Criar o veículo e vinculá-lo ao cliente. |
| Cliente identificado / cadastrado | EV | Resultados positivos da identificação/cadastro. |
| Veículo registrado | EV | Veículo criado e vinculado ao cliente. |
| Dados inválidos / Placa inválida | EV | Falhas de validação que pedem correção. |

**Invariantes:** CPF/CNPJ válido e único; placa válida e única; todo veículo pertence a exatamente um cliente.

---

## Contexto: Ordem de Serviço  (AG: Ordem de Serviço — núcleo do sistema)

A OS carrega o ciclo de vida inteiro: abertura → diagnóstico → orçamento → execução → entrega. Orçamento e Diagnóstico são entidades **internas** da OS (não agregados separados).

| Termo | Tipo | Definição |
|---|---|---|
| Ordem de Serviço (OS) | EN (raiz) | Registro completo do atendimento de um veículo, do recebimento à entrega. |
| Status da OS | VO | Estado atual da OS. Valores: Recebida, Em diagnóstico, Aguardando aprovação, Aguardando peça, Em execução, Finalizada, Entregue, Cancelada. |
| Aguardando peça | VO (status) | Orçamento aprovado, mas a execução não começa porque uma ou mais peças foram encomendadas. A OS sai deste estado para Em execução quando todas as peças encomendadas chegam ao estoque. |
| Encomenda | EN (Estoque) | Pedido de uma peça em falta ao fornecedor, ligado à OS que a aguarda. Situações: Pendente, Recebida, Cancelada. Ao dar entrada da peça no estoque, a encomenda é atendida (reservada) e a OS é avisada. |
| Diagnóstico | EN | Avaliação técnica feita pelo mecânico; reúne os serviços e peças necessários. |
| Serviço Orçado | EN (interna) | Linha de serviço de um orçamento (referencia o Catálogo de Serviços) com preço **congelado**. |
| Peça Orçada | EN (interna) | Linha de peça de um orçamento (referencia o Estoque) com quantidade, situação e preço **congelado**. |
| Orçamento | EN (interna) | Conjunto consolidado de serviços + peças enviado ao cliente para aprovação. Uma OS tem vários: um **INICIAL** (diagnóstico) e zero ou mais **ADICIONAL**. Aprovar/recusar o INICIAL muda o status da OS. |
| Orçamento adicional | EN (interna) | Orçamento (tipo ADICIONAL) com serviço/peça identificado durante a execução, que exige nova autorização do cliente. Antes chamado de "reparo adicional". |
| Tempo de execução | VO | Duração registrada da execução, base para o tempo médio. |
| Problema relatado | VO | Descrição do problema informado na abertura. |

**Comandos:** Solicitar atendimento · Abrir OS · Registrar problema · Iniciar diagnóstico · Registrar serviços · Registrar peças · Concluir diagnóstico · Gerar orçamento · Enviar orçamento · Aprovar orçamento · Recusar orçamento · Retirar peças · Executar reparo · Concluir reparo · Atualizar tempo · Identificar novo reparo · Atualizar orçamento · Aprovar/Recusar novo reparo · Conferir serviços · Assinar OS · Efetuar pagamento · Entregar veículo · Encerrar OS.

**Eventos:** Atendimento solicitado · OS aberta · Problema registrado · Diagnóstico iniciado/concluído · Serviços/Peças registrados · Orçamento gerado/enviado/aprovado/recusado · Peças retiradas · Serviço executado · Reparo concluído · Tempo registrado · Reparo incluído na OS · Orçamento atualizado · Novo reparo aprovado/recusado · OS conferida · OS assinada · Pagamento confirmado · Veículo entregue · OS encerrada.

**Políticas (gatilhos automáticos):**
- Ao registrar peças → verificar estoque (chama o Estoque).
- Ao concluir o diagnóstico → gerar orçamento.
- Status muda sozinho conforme a ação: Em diagnóstico, Aguardando aprovação, Aguardando peça, Em execução, Finalizada, Entregue, Cancelada.
- Ao aprovar o orçamento → reservar disponíveis e encomendar faltantes (chama o Estoque). Se houver peça encomendada, a OS vai para Aguardando peça em vez de Em execução.
- Ao dar entrada (ENTRADA) de uma peça no estoque → atende as encomendas pendentes daquela peça (FIFO) e avisa a OS; quando a última peça encomendada chega, a OS vai de Aguardando peça para Em execução.
- OS cancelada → cancela as encomendas pendentes dela.
- Cliente sem resposta (orçamento inicial ou adicional) → o Sistema reenvia a notificação periodicamente (**não** expira).
- Conclusão da execução só vai para Finalizada se não houver orçamento (inicial ou adicional) pendente. Orçamento adicional recusado → o veículo é entregue sem aquele trabalho.
- Pagamento recusado → reter o veículo até o pagamento.

**Invariantes (máquina de estados):** as transições só seguem a ordem válida; a execução só inicia com todas as peças reservadas; o diagnóstico só conclui depois que o estoque responde (disponibilidade/cotação).

---

## Contexto: Estoque de Peças  (AG: Estoque — raiz Peça)

| Termo | Tipo | Definição |
|---|---|---|
| Peça | EN (raiz) | Item de estoque com saldo e preço unitário. |
| Insumo | EN | Material consumível tratado como peça para fins de estoque. |
| Saldo físico | VO | Quantidade real em prateleira. |
| Reservado | VO | Quantidade comprometida com OS aprovadas. |
| Disponível | VO | `físico − reservado`. É o que o "Verificar disponibilidade" enxerga. |
| Cotação | VO | Preço e prazo retornados pelo fornecedor para uma peça em falta. (Cotação ≠ compra.) |
| Reserva | — | Compromisso de peça para uma OS. Só ocorre **após** a aprovação do orçamento. |
| Encomenda | — | Pedido de peça em falta ao fornecedor. |
| Verificar disponibilidade | CMD | Consulta (somente leitura) do saldo para uma OS. Não reserva nada. |
| Solicitar cotação | CMD | Pede preço/prazo ao fornecedor para peça indisponível. |
| Reservar peças | CMD | Compromete as peças disponíveis (automático, na aprovação). |
| Encomendar peças | CMD | Pede ao fornecedor as peças faltantes. |
| Registrar recebimento | CMD | Registra a chegada da peça encomendada. |
| Atualizar estoque | CMD | Atualiza o saldo após o recebimento. |
| Baixar peças | CMD | Dá baixa no saldo quando o mecânico retira a peça na execução. |

**Eventos:** Peça disponível/indisponível · Cotação recebida · Peças reservadas/encomendadas/recebidas/retiradas · Estoque atualizado.

**Políticas:** indisponível → cotar com fornecedor; estoque atualizado (peça chegou) → liberar a OS que aguardava.

**Invariantes:** `disponível = físico − reservado`; não é possível reservar acima do disponível; baixa só do que está reservado/em estoque.

**Ponto de atenção (PA) em aberto:** sem cotação do fornecedor, a OS segue sem a peça? (decisão de negócio pendente.)

---

## Contexto: Catálogo de Serviços  (suporte)

| Termo | Tipo | Definição |
|---|---|---|
| Serviço | EN | Tipo de serviço oferecido (ex.: troca de óleo, alinhamento) com preço base. |

---

## Contexto: Identidade e Acesso  (genérico)

| Termo | Tipo | Definição |
|---|---|---|
| Usuário administrativo | EN | Operador interno (recepcionista/mecânico/gestor) que acessa as APIs administrativas. |
| Autenticação JWT | — | Token Bearer exigido nas rotas administrativas. |
| Login por CPF | — | Entrada do cliente no aplicativo: a Lambda `auth-cpf` confere se o CPF pertence a um cliente ativo e devolve o token do cliente. |
| Token do cliente | — | JWT `{ sub: clienteId, papel: CLIENTE }`. Dá acesso só às OSs daquele cliente, no acompanhamento; não abre rotas administrativas. |

---

## Pontos de atenção (PA) do Event Storming

| Ponto de atenção | Onde se aplica | Status |
|---|---|---|
| Como o mecânico é escolhido/atribuído | Iniciar diagnóstico | Em aberto (definir regra) |
| Sem cotação: segue sem a peça? | Solicitar cotação (Estoque) | Em aberto (decisão de negócio) |
| Cliente não responde à autorização | Aguardando aprovação / reparo adicional | Resolvido: reenvio periódico pelo Sistema |
| Concluir só após ter a cotação | Concluir diagnóstico | Resolvido: guarda |
| Validação de dados (CPF/CNPJ, placa) | Cadastrar cliente/veículo | Resolvido: invariante |

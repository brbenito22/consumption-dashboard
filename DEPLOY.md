# Deploy — Cost Center no ambiente do cliente

Passo a passo para publicar o app no tenant Dynatrace do cliente.

---

## Pré-requisitos

- **Node.js 18+** (validado com v20/v24 LTS) — `node --version`
- **npm 9+** — `npm --version`
- **Git**
- **URL do tenant do cliente** no formato `https://<TENANT_ID>.apps.dynatrace.com`
- Login com **permissão de deploy** no tenant (`app-engine:apps:install`) — o CLI abre o browser para OAuth interativo

---

## 1. Clonar o repositório

```bash
git clone https://github.com/brbenito22/consumption-dashboard.git
cd consumption-dashboard
```

## 2. Configurar o tenant do cliente

Abra `app.config.json` e altere **APENAS** o `environmentUrl`:

```json
{
  "environmentUrl": "https://<TENANT_ID_DO_CLIENTE>.apps.dynatrace.com",
  "app": {
    "id": "my.consumption.dashboard",
    ...
  }
}
```

> ⚠️ **NÃO comite essa mudança.** O repo é público — o `environmentUrl` fica com o placeholder `<YOUR_TENANT_ID>` no upstream. Trabalhe apenas localmente.

## 3. Instalar dependências

```bash
npm install
```

~2 min · ~670 packages.

## 4. Type-check

```bash
node node_modules/typescript/bin/tsc --noEmit
```

Precisa passar sem erros antes do deploy.

## 5. Deploy

```bash
npm run deploy
```

- Abre uma janela do browser para autenticação OAuth no tenant configurado.
- Aprove a autorização.
- Espere pela mensagem **`√ App is deployed`**.

## 6. Autorizar scopes na primeira execução

Abra a URL retornada pelo deploy:

```
https://<TENANT_ID>.apps.dynatrace.com/ui/apps/my.consumption.dashboard
```

Na primeira vez o Dynatrace pede consent dos **10 scopes** do app:
- `app-settings:objects:read`
- `storage:logs:read` · `storage:spans:read` · `storage:events:read` · `storage:bizevents:read`
- `storage:metrics:read` · `storage:entities:read`
- `storage:buckets:read` · `storage:system:read`
- `environment-api:metrics:read`

Aprovar.

---

## 7. (Recomendado) Rate card real do contrato

Sem isso, o app usa **rate card default (list price, USD)** e o KPI *Dynatrace Official Cost* fica oculto.

### 7.1 Criar OAuth client no myaccount

1. Abrir <https://myaccount.dynatrace.com>.
2. **Identity & access management → OAuth clients → Create client**.
3. Conceder o scope **`account-uac-read`** (Account UAC read).
4. Copiar **Client ID** (começa com `dt0s02.`) e **Client Secret** (exibido **uma única vez**).

### 7.2 Anotar Account UUID

Na URL do myaccount: `account/<UUID>`, ou em **Account settings**.

### 7.3 Liberar chamadas externas do tenant

No tenant do cliente:

**Settings → General → Environment management → External requests** → adicionar (sem `https://`):
- `sso.dynatrace.com`
- `api.dynatrace.com`

*(Sem isso a App Function não consegue chamar o Account Management API.)*

### 7.4 Configurar no app

1. Abrir aba **Billing & Cost Analysis** do Cost Center.
2. Clicar em **Configure rate card** (canto superior direito).
3. **Rate Card Source = Account Rate Card**.
4. Colar Account ID / Client ID / Client Secret → **Save**.

O card do topo troca de **laranja** (default) para **verde** (account) e o **Dynatrace Official Cost** aparece nos KPIs.

---

## Redeploy (nova versão)

1. Fazer bump da `version` em `app.config.json` (ex.: `1.50.14` → `1.50.15`).
2. `npm run deploy`.

O dt-app rejeita deploy com a mesma versão já publicada — sempre bump.

## Desinstalar

```bash
npm run uninstall
```

## Rollback

Não há rollback nativo. Para versão anterior:

```bash
git checkout <commit-anterior>
# ajustar version em app.config.json para uma nova (ex: hotfix)
npm run deploy
```

---

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| `App is already deployed` (mesma version) | Version não foi bumpada | Bump `version` em `app.config.json` |
| `403 Forbidden` no OAuth | Usuário sem `app-engine:apps:install` | Pedir permissão ao owner do tenant |
| Aba Billing: cabeçalho **laranja** | Rate card default em uso | Fazer passo 7 (Rate card do cliente) |
| Aba Billing: `no rate card match` em uma capability | Rate card do cliente não lista essa capability | Sem ação — app usa default para aquela linha |
| Aba Cloud vazia (`no cloud integration`) | Cliente sem AWS/Azure/GCP integrado no tenant | Comportamento esperado |
| Aba Infra: `Cloud-Inherited Hosts = 0` | Nenhum host com OneAgent tem `cloudType` | Comportamento esperado (só on-prem) |
| Números divergem do **Cost Management** do Dynatrace | Janelas de tempo diferentes | Alinhar timeframe do app (ex.: 30d) e comparar com o **Last 0-30 days** do Cost Management |

---

## Notas de segurança (obrigatório)

- **NUNCA** comitar `app.config.json` com a URL real do tenant. Placeholder `<YOUR_TENANT_ID>` é o valor no upstream.
- **NUNCA** comitar tokens, secrets, Account UUID ou dados pessoais.
- **NUNCA** usar `git add -A` — sempre `git add <arquivos-explícitos>`.
- Tokens/credenciais ficam **apenas em `.dt-app/`** (já no `.gitignore`).
- Ao criar PRs, faça um scan rápido do `git diff --cached` para garantir zero URL/UUID/token vazando.

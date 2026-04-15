# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

Aplicação web de arquivo único sem build. Três arquivos principais:

- `index.html` — toda a estrutura HTML: views, modais, sidebar
- `app.js` — toda a lógica (3330 linhas): autenticação, estado, renderização, persistência
- `style.css` — estilos (1328 linhas)

Dependências via CDN (sem npm, sem build):
- `@supabase/supabase-js@2` — banco de dados e auth
- `chart.js@4.4.0` — gráficos do dashboard

Para testar: abrir `index.html` diretamente no browser ou via Live Server.

## Arquitetura

### State global (`app.js:115`)
Um único objeto `state` em memória contém todos os dados:
```
state.cobrancas[], state.contasPagar[], state.despesas[], state.clientes[]
state.categorias[], state.categoriasDespesas[], state.categoriasCP[]
state.empresaId, state.meuPerfil, state.config, state.notificacoes[]
```
Globals adicionais: `viewAtual`, `selecionadosCobrancas` (Set), `selecionadosCP` (Set), `tableSort`.

### Fluxo de dados
1. Login → `inicializarContextoEmpresa()` → carrega empresa do usuário
2. `carregarDadosSupabase()` (app.js:424) — carrega tudo em paralelo via Promise.all
3. Dados ficam em `state.*` durante toda a sessão
4. Cada operação CRUD: atualiza `state` imediatamente → persiste no Supabase de forma assíncrona (fire-and-forget com `.then(({ error }) => console.error(...))`)

### Padrão de mappers (app.js:348)
Cada entidade tem dois mappers obrigatórios:
- `entidadeParaDb(obj)` — converte camelCase (app) → snake_case (Supabase)
- `dbParaEntidade(row)` — converte snake_case → camelCase

**Sempre atualizar os dois mappers ao adicionar colunas.**

### Views e navegação (app.js:666)
`navegarPara(view)` troca a view ativa e chama o `render*()` correspondente. Views:
`dashboard | cobrancas | contaspagar | despesas | clientes | relatorios | usuarios | configuracoes`

Cada view tem um `<div id="view-{nome}">` em `index.html` e uma função `render{Nome}()` em `app.js`.

### Modais
Cada modal tem:
- `abrirModal{Entidade}(id?)` — popula campos, abre com `.classList.add('open')`
- `fecharModal{Entidade}Force()` — fecha
- `salvar{Entidade}(event)` — trata create (sem id) e update (com id)

### Permissões (app.js:211)
Perfis: `admin/adm` > `operador` > `colaborador` > `controler`
- `isAdm()`, `isColaborador()`, `isControler()`
- `podeAcessarView(view)` — colaborador não acessa dashboard/relatórios; nenhum não-adm acessa usuários/configurações

## Banco de Dados (Supabase)

**Projeto:** `gcucadlnxttlxckravui.supabase.co`

### Tabelas e colunas-chave

| Tabela | Colunas especiais |
|--------|-------------------|
| `cobrancas` | `grupo_id TEXT` — vincula lançamentos recorrentes da mesma série |
| `contas_pagar` | `grupo_id TEXT` — idem |
| `clientes` | `contract_url TEXT` — URL pública do Storage bucket `contratos` |
| `user_config` | `categorias`, `categorias_despesas`, `categorias_cp`, `config`, `contadores` — todos JSONB |
| `usuarios_empresa` | `perfil` — valores: `admin`, `adm`, `operador`, `colaborador`, `controler` |

Todas as tabelas usam `empresa_id` para isolamento multi-tenant (filtro em toda query).

### Recorrência
Ao criar lançamentos recorrentes, todos recebem o mesmo `grupoId` (gerado por `uid()`). Ao editar, o sistema pergunta se atualiza os demais da série (filtra por `grupoId`). Datas de vencimento e status de pagamento nunca são alterados em batch.

## Convenções

- **Nomes de clientes sempre em uppercase** — aplicado em `salvarCobranca` e `salvarDespesa`
- **IDs** gerados por `uid()` (timestamp + random, não UUID v4)
- **Moeda** formatada com `fmt()` (BRL) e parseada com `parseMoedaBR()`; inputs usam a classe `money-input` com máscara automática
- **Datas** armazenadas como string `YYYY-MM-DD`; exibidas com `fmtData()` → `DD/MM/YYYY`
- **Status** calculado automaticamente por `atualizarStatusAuto()` / `atualizarStatusAutoCP()` a cada render — não persistido de forma proativa
- **Toast** via `toast(msg, tipo?)` — tipos: `'success'` (default verde), `'error'`

## Seções do app.js (por linha)

| Linha | Seção |
|-------|-------|
| 1 | Auth (login, cadastro, empresa) |
| 114 | STATE |
| 169 | UTILS |
| 211 | PERFIS E PERMISSÕES |
| 347 | PERSISTÊNCIA SUPABASE (mappers + carregarDadosSupabase) |
| 476 | EMPRESA / MULTI-TENANT |
| 650 | STATUS AUTO |
| 666 | NAVEGAÇÃO |
| 737 | DASHBOARD |
| 888 | COBRANÇAS (render + filtros) |
| 1049 | MODAL COBRANÇA (abrir + salvar + recorrência) |
| 1295 | SELEÇÃO EM MASSA |
| 1514 | BAIXA (dar baixa + desfazer) |
| 1581 | RELATÓRIOS |
| 1796 | CONFIGURAÇÕES |
| 1907 | EXPORT / IMPORT |
| 2019 | TOAST |
| 2029 | CONTAS A PAGAR |
| 2370 | CLIENTES |
| 2626 | DESPESAS REEMBOLSÁVEIS |
| 2794 | NOTA DE DÉBITO |
| 2899 | RECIBO DE PAGAMENTO |
| 2965 | RECIBO DE DESPESA |
| 3032 | USUÁRIOS |
| 3215 | NOTIFICAÇÕES |
| 3309 | INIT (DOMContentLoaded) |

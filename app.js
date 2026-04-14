/* ===== Financeiro NG — app.js ===== */

const supabaseUrl ="https://gcucadlnxttlxckravui.supabase.co"
const supabaseKey = "sb_publishable_5i0somnwIAvyLNImLSWYxg_yogC3bCb"

const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
console.log("Biblioteca Supabase:", supabase);
console.log("Cliente Supabase:", supabaseClient);

async function cadastrarUsuario() {
  const email = document.getElementById('cadastroEmail').value.trim();
  const senha = document.getElementById('cadastroSenha').value.trim();

  const { data, error } = await supabaseClient.auth.signUp({
    email: email,
    password: senha
  });

  console.log('Cadastro:', data);
  console.log('Erro:', error);

  if (error) {
    alert(error.message);
    return;
  }

  alert('Usuário criado com sucesso. Verifique seu email.');
}

async function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const senha = document.getElementById('loginSenha').value.trim();

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: senha
  });

  console.log('Login:', data);
  console.log('Erro login:', error);

  if (error) {
    alert(error.message);
    return;
  }

  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
}

async function verificarSessao() {
  const { data } = await supabaseClient.auth.getSession();

  const usuarioAtual = data.session?.user;
console.log(usuarioAtual);

  if (data.session) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
  } else {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
  }
}

verificarSessao();

async function logout() {
  await supabaseClient.auth.signOut();

  document.getElementById('app').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
}

// ===== STATE =====
let state = {
  cobrancas: [],
  categorias: [
    { nome: 'Honorários de Êxito',   cor: '#6366f1' },
    { nome: 'Honorários Mensais',    cor: '#8b5cf6' },
    { nome: 'Honorários Pro-Labore', cor: '#a855f7' },
    { nome: 'Custas',                cor: '#3b82f6' },
    { nome: 'Diligências',           cor: '#06b6d4' },
    { nome: 'Impostos',              cor: '#ef4444' },
    { nome: 'Outros',                cor: '#6b7280' },
  ],
  clientes: [],
  despesas: [],
  contasPagar: [],
  contadores: { notaDebito: 0, recibo: 0 },
  config: { diasAlerta: 7 },
};

let viewAtual = 'dashboard';
let baixaIdAtual = null;
let baixaColecao = 'cobrancas'; // 'cobrancas' | 'contaspagar'
let chartCategoria = null;
let chartEvolucao = null;
let chartRelCategoria = null;
let tableSort = {
  cobrancas: { key: 'dataVencimento', direction: 'asc' },
  despesas: { key: 'data', direction: 'desc' },
  contaspagar: { key: 'dataVencimento', direction: 'asc' },
};

// ===== UTILS =====
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function fmt(valor) {
  return (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtNumeroBR(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtData(d) {
  if (!d) return '-';
  const [y, m, dia] = d.split('-');
  return `${dia}/${m}/${y}`;
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function diasAte(dataStr) {
  const diff = new Date(dataStr + 'T00:00:00') - new Date(hoje() + 'T00:00:00');
  return Math.round(diff / 86400000);
}

function nomeMes(n) {
  return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][n - 1];
}

function mesesNome() {
  return ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
}

function corCategoria(nome) {
  const cat = state.categorias.find(c => c.nome === nome);
  return cat ? cat.cor : '#9ca3af';
}

function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function valorOrdenacao(tipo, item, chave) {
  if (tipo === 'cobrancas') {
    if (chave === 'cliente') return normalizarTexto(nomeClienteTexto(item.clienteId));
    if (chave === 'descricao') return normalizarTexto(item.descricao);
    if (chave === 'categoria') return normalizarTexto(item.categoria);
    if (chave === 'dataVencimento') return item.dataVencimento || '';
    if (chave === 'valor') return Number(item.valor || 0);
    if (chave === 'recorrencia') return normalizarTexto(item.recorrencia === 'nenhuma' ? '' : item.recorrencia);
    if (chave === 'status') return normalizarTexto(item.status);
  }

  if (tipo === 'despesas') {
    if (chave === 'cliente') return normalizarTexto(nomeClienteTexto(item.clienteId));
    if (chave === 'descricao') return normalizarTexto(item.descricao);
    if (chave === 'data') return item.data || '';
    if (chave === 'valor') return Number(item.valor || 0);
    if (chave === 'status') return normalizarTexto(item.status);
  }

  if (tipo === 'contaspagar') {
    if (chave === 'descricao') return normalizarTexto(item.descricao);
    if (chave === 'tipo') return normalizarTexto(item.tipo);
    if (chave === 'dataVencimento') return item.dataVencimento || '';
    if (chave === 'valor') return Number(item.valor || 0);
    if (chave === 'recorrencia') return normalizarTexto(item.recorrencia === 'nenhuma' ? '' : item.recorrencia);
    if (chave === 'status') return normalizarTexto(item.status);
  }

  return '';
}

function aplicarOrdenacao(tipo, lista) {
  const { key, direction } = tableSort[tipo];
  const fator = direction === 'asc' ? 1 : -1;

  return [...lista].sort((a, b) => {
    const valorA = valorOrdenacao(tipo, a, key);
    const valorB = valorOrdenacao(tipo, b, key);

    if (valorA < valorB) return -1 * fator;
    if (valorA > valorB) return 1 * fator;
    return 0;
  });
}

function atualizarIndicadoresOrdenacao(tipo, colunas) {
  colunas.forEach(coluna => {
    const el = document.getElementById(`sort-${tipo}-${coluna}`);
    if (!el) return;

    if (tableSort[tipo].key === coluna) {
      el.textContent = tableSort[tipo].direction === 'asc' ? '▲' : '▼';
      el.classList.add('active');
    } else {
      el.textContent = '';
      el.classList.remove('active');
    }
  });
}

function ordenarTabela(tipo, coluna) {
  const atual = tableSort[tipo];
  if (atual.key === coluna) {
    atual.direction = atual.direction === 'asc' ? 'desc' : 'asc';
  } else {
    atual.key = coluna;
    atual.direction = (tipo === 'despesas' && coluna === 'data') || ((tipo === 'cobrancas' || tipo === 'contaspagar') && coluna === 'valor') ? 'desc' : 'asc';
  }

  if (tipo === 'cobrancas') renderCobrancas();
  if (tipo === 'despesas') renderDespesas();
  if (tipo === 'contaspagar') renderContasPagar();
}

function parseMoedaBR(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return 0;
  const normalizado = texto.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const numero = parseFloat(normalizado);
  return Number.isFinite(numero) ? numero : NaN;
}

function formatarCampoMoeda(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  if (!digitos) return '';
  return fmtNumeroBR(Number(digitos) / 100);
}

function aplicarMascaraMoeda(event) {
  event.target.value = formatarCampoMoeda(event.target.value);
}

function configurarCamposMoeda() {
  document.querySelectorAll('.money-input').forEach(input => {
    if (input.dataset.moneyReady === 'true') return;
    input.dataset.moneyReady = 'true';
    input.addEventListener('input', aplicarMascaraMoeda);
    input.addEventListener('blur', aplicarMascaraMoeda);
  });
}

// ===== PERSISTÊNCIA =====
async function carregarClientesSupabase() {
const { data, error } = await supabaseClient
.from('clientes')
.select('*')
.order('created_at', { ascending: false });

if (error) {
console.error('Erro ao carregar clientes:', error);
return;
}

state.clientes = data || [];

renderClientes();
popularClientesForms();
renderDashboard();

}

function salvarStorage() {
  localStorage.setItem('fng_state', JSON.stringify(state));
}

function carregarStorage() {
  const raw = localStorage.getItem('fng_state');
  if (raw) {
    try {
      const s = JSON.parse(raw);
      state.cobrancas = s.cobrancas || [];
      state.categorias = s.categorias || state.categorias;

      // Migração: substituir categorias genéricas antigas pelas de advocacia
      const antigas = ['Aluguel', 'Utilities', 'Serviços'];
      const temAntigas = antigas.some(n => state.categorias.find(c => c.nome === n));
      const temNovas   = state.categorias.find(c => c.nome === 'Honorários de Êxito');
      if (temAntigas && !temNovas) {
        state.categorias = state.categorias.filter(c => !antigas.includes(c.nome));
        state.categorias.unshift(
          { nome: 'Honorários de Êxito',   cor: '#6366f1' },
          { nome: 'Honorários Mensais',    cor: '#8b5cf6' },
          { nome: 'Honorários Pro-Labore', cor: '#a855f7' },
        );
        if (!state.categorias.find(c => c.nome === 'Custas'))
          state.categorias.splice(3, 0, { nome: 'Custas', cor: '#3b82f6' });
        if (!state.categorias.find(c => c.nome === 'Diligências'))
          state.categorias.splice(4, 0, { nome: 'Diligências', cor: '#06b6d4' });
      }
      state.clientes = s.clientes || [];
      state.despesas = s.despesas || [];
      state.contasPagar = s.contasPagar || [];
      state.contadores = { notaDebito: 0, recibo: 0, ...(s.contadores || {}) };
      state.config = { ...state.config, ...(s.config || {}) };
    } catch (e) {
      console.warn('Erro ao carregar dados:', e);
    }
  }
}

// ===== STATUS AUTO =====
function calcularStatus(c) {
  if (c.status === 'pago') return 'pago';
  const d = diasAte(c.dataVencimento);
  if (d < 0) return 'vencido';
  return 'pendente';
}

function atualizarStatusAuto() {
  state.cobrancas.forEach(c => {
    if (c.status !== 'pago') {
      c.status = calcularStatus(c);
    }
  });
}

// ===== NAVEGAÇÃO =====
function navegarPara(view) {
  viewAtual = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById('view-' + view)?.classList.add('active');
  document.querySelector(`[data-view="${view}"]`)?.classList.add('active');

  const titulos = { dashboard: 'Dashboard', cobrancas: 'Cobranças', relatorios: 'Relatórios', configuracoes: 'Configurações', clientes: 'Clientes', despesas: 'Despesas', contaspagar: 'Contas a Pagar' };
  document.getElementById('pageTitle').textContent = titulos[view] || '';
  atualizarAcaoTopo(view);

  if (view === 'dashboard') renderDashboard();
  else if (view === 'cobrancas') { renderCobrancas(); popularFiltros(); }
  else if (view === 'relatorios') renderRelatorios();
  else if (view === 'configuracoes') renderConfiguracoes();
  else if (view === 'clientes') renderClientes();
  else if (view === 'despesas') renderDespesas();
  else if (view === 'contaspagar') renderContasPagar();
}

function atualizarAcaoTopo(view) {
  const actions = document.getElementById('topbarActions');
  if (!actions) return;

  const botoesPorView = {
    dashboard: [
      { label: 'Nova Cobrança', action: "abrirModalCobranca()" },
      { label: 'Nova Conta a Pagar', action: "abrirModalContaPagar()" },
      { label: 'Nova Despesa', action: "abrirModalDespesa()" },
      { label: 'Emitir Relatórios', action: "navegarPara('relatorios')" },
    ],
    cobrancas: [
      { label: 'Nova Cobrança', action: "abrirModalCobranca()" },
    ],
    contaspagar: [
      { label: 'Nova Conta a Pagar', action: "abrirModalContaPagar()" },
    ],
    despesas: [
      { label: 'Nova Despesa', action: "abrirModalDespesa()" },
    ],
    relatorios: [
      { label: 'Imprimir Relatório', action: "imprimirRelatorio()" },
    ],
    clientes: [
      { label: 'Novo Cliente', action: "abrirModalCliente()" },
    ],
    configuracoes: [],
  };

  const botoes = botoesPorView[view] || [];
  actions.innerHTML = botoes.map(({ label, action }) => `
    <button class="btn btn-primary" onclick="${action}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <span>${label}</span>
    </button>
  `).join('');
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ===== DASHBOARD =====
function renderDashboard() {
  atualizarStatusAuto();
  atualizarStatusAutoCP();
  const agora = new Date();
  const mesAtual = agora.getMonth() + 1;
  const anoAtual = agora.getFullYear();

  const pendentes = state.cobrancas.filter(c => c.status === 'pendente' || c.status === 'vencido');
  const vencidas = state.cobrancas.filter(c => c.status === 'vencido');
  const pagas = state.cobrancas.filter(c => {
    if (c.status !== 'pago') return false;
    const dp = c.dataPagamento || c.dataVencimento;
    const [y, m] = dp.split('-');
    return parseInt(m) === mesAtual && parseInt(y) === anoAtual;
  });
  const dias = state.config.diasAlerta || 7;
  const proximas = state.cobrancas.filter(c => {
    const d = diasAte(c.dataVencimento);
    return c.status === 'pendente' && d >= 0 && d <= dias;
  });

  document.getElementById('totalReceber').textContent = fmt(pendentes.reduce((s, c) => s + c.valor, 0));
  document.getElementById('qtdReceber').textContent = `${pendentes.length} cobrança${pendentes.length !== 1 ? 's' : ''}`;

  document.getElementById('totalVencidas').textContent = fmt(vencidas.reduce((s, c) => s + c.valor, 0));
  document.getElementById('qtdVencidas').textContent = `${vencidas.length} cobrança${vencidas.length !== 1 ? 's' : ''}`;

  document.getElementById('totalPagas').textContent = fmt(pagas.reduce((s, c) => s + (c.valorPago || c.valor), 0));
  document.getElementById('qtdPagas').textContent = `${pagas.length} cobrança${pagas.length !== 1 ? 's' : ''}`;

  document.getElementById('totalProximas').textContent = fmt(proximas.reduce((s, c) => s + c.valor, 0));
  document.getElementById('qtdProximas').textContent = `${proximas.length} cobrança${proximas.length !== 1 ? 's' : ''}`;

  const receberMes = state.cobrancas.filter(c => {
    if (c.status === 'pago') return false;
    if (!c.dataVencimento) return false;
    const [y, m] = c.dataVencimento.split('-');
    return parseInt(m) === mesAtual && parseInt(y) === anoAtual;
  });
  const totalReceberMes = receberMes.reduce((s, c) => s + c.valor, 0);
  document.getElementById('totalReceberMes').textContent = fmt(totalReceberMes);
  document.getElementById('qtdReceberMes').textContent = `${receberMes.length} cobrança${receberMes.length !== 1 ? 's' : ''}`;

  const pagarMes = state.contasPagar.filter(cp => {
    if (!cp.dataVencimento) return false;
    const [y, m] = cp.dataVencimento.split('-');
    return parseInt(m) === mesAtual && parseInt(y) === anoAtual;
  });
  const totalPagarMes = pagarMes.reduce((s, cp) => s + cp.valor, 0);
  document.getElementById('totalPagarMes').textContent = fmt(totalPagarMes);
  document.getElementById('qtdPagarMes').textContent = `${pagarMes.length} conta${pagarMes.length !== 1 ? 's' : ''}`;

  const contasPagasMes = pagarMes.filter(cp => cp.status === 'pago');
  const totalContasPagas = contasPagasMes.reduce((s, cp) => s + (cp.valorPago || cp.valor), 0);
  document.getElementById('totalContasPagas').textContent = fmt(totalContasPagas);
  document.getElementById('qtdContasPagas').textContent = `${contasPagasMes.length} conta${contasPagasMes.length !== 1 ? 's' : ''}`;

  const totalRecebidoMes = pagas.reduce((s, c) => s + (c.valorPago || c.valor), 0);
  const liquidoMes = (totalReceberMes + totalRecebidoMes) - totalPagarMes;
  const cardLiquido = document.getElementById('cardLiquidoMes');
  cardLiquido.className = 'card ' + (liquidoMes >= 0 ? 'card-liquido-pos' : 'card-liquido-neg');
  document.getElementById('totalLiquidoMes').textContent = fmt(Math.abs(liquidoMes));
  document.getElementById('subLiquidoMes').textContent = liquidoMes >= 0 ? '▲ resultado positivo' : '▼ déficit no mês';

  // Resultado Financeiro
  const totalBruto = pendentes.reduce((s, c) => s + c.valor, 0);
  const cpPendentes = state.contasPagar.filter(cp => cp.status !== 'pago');
  const totalPagar = cpPendentes.reduce((s, cp) => s + cp.valor, 0);
  const liquido = totalBruto - totalPagar;
  document.getElementById('res-bruto').textContent = fmt(totalBruto);
  document.getElementById('res-pagar').textContent = fmt(totalPagar);
  document.getElementById('res-pagar-qtd').textContent = `${cpPendentes.length} conta${cpPendentes.length !== 1 ? 's' : ''}`;
  const liqEl = document.getElementById('res-liquido');
  liqEl.textContent = fmt(Math.abs(liquido));
  liqEl.className = 'res-valor ' + (liquido >= 0 ? 'positivo' : 'negativo');
  document.getElementById('res-liquido-label').textContent = liquido >= 0 ? 'Resultado Líquido' : 'Déficit';
  document.getElementById('res-liquido-icon').textContent = liquido >= 0 ? '▲' : '▼';

  // Alertas
  const alertasEl = document.getElementById('alertas-container');
  let alertasHtml = '';
  if (vencidas.length > 0) {
    alertasHtml += `<div class="alerta alerta-danger">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span><strong>${vencidas.length} cobrança${vencidas.length !== 1 ? 's' : ''} vencida${vencidas.length !== 1 ? 's' : ''}!</strong> Total: ${fmt(vencidas.reduce((s,c) => s+c.valor, 0))}</span>
    </div>`;
  }
  if (proximas.length > 0) {
    alertasHtml += `<div class="alerta alerta-warning">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <span><strong>${proximas.length} cobrança${proximas.length !== 1 ? 's' : ''}</strong> vence${proximas.length !== 1 ? 'm' : ''} nos próximos ${dias} dias</span>
    </div>`;
  }
  alertasEl.innerHTML = alertasHtml;

  // Lista próximos vencimentos
  const listaEl = document.getElementById('lista-proximas');
  const proxOrdenadas = [...state.cobrancas]
    .filter(c => c.status !== 'pago')
    .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento))
    .slice(0, 8);

  if (proxOrdenadas.length === 0) {
    listaEl.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:20px 0;text-align:center">Nenhuma cobrança pendente</p>';
  } else {
    listaEl.innerHTML = proxOrdenadas.map(c => {
      const d = diasAte(c.dataVencimento);
      const cls = d < 0 ? 'vencido' : d <= 3 ? 'proximo' : 'ok';
      const label = d < 0 ? `Venceu há ${Math.abs(d)}d` : d === 0 ? 'Vence hoje' : `Em ${d}d`;
      return `<div class="cobranca-item">
        <div class="cobranca-dot" style="background:${corCategoria(c.categoria)}"></div>
        <div class="cobranca-info">
          <div class="cobranca-desc">${c.descricao}</div>
          <div class="cobranca-meta">${fmtData(c.dataVencimento)} · ${c.categoria || 'Sem categoria'} · ${label}</div>
        </div>
        <div class="cobranca-valor ${cls}">${fmt(c.valor)}</div>
      </div>`;
    }).join('');
  }

  // Gráfico categorias
  const cats = {};
  state.cobrancas.filter(c => c.status !== 'pago').forEach(c => {
    const k = c.categoria || 'Sem categoria';
    cats[k] = (cats[k] || 0) + c.valor;
  });

  const catLabels = Object.keys(cats);
  const catValues = Object.values(cats);
  const catColors = catLabels.map(l => corCategoria(l));

  const ctx = document.getElementById('chartCategoria');
  if (chartCategoria) chartCategoria.destroy();
  if (catLabels.length === 0) {
    ctx.parentElement.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center">Sem dados</p>';
  } else {
    chartCategoria = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: catLabels, datasets: [{ data: catValues, backgroundColor: catColors, borderWidth: 2, borderColor: '#fff' }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12, boxWidth: 12 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}` } }
        }
      }
    });
  }
}

// ===== COBRANÇAS =====
function popularFiltros() {
  const selCliente = document.getElementById('filterClienteCobranca');
  if (selCliente) {
    const valCliente = selCliente.value;
    selCliente.innerHTML = '<option value="">Todos os clientes</option>' +
      state.clientes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    selCliente.value = valCliente;
  }

  // Categorias
  const selCat = document.getElementById('filterCategoria');
  const valCat = selCat.value;
  selCat.innerHTML = '<option value="">Todas categorias</option>' +
    state.categorias.map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');
  selCat.value = valCat;

  // Meses disponíveis
  const meses = [...new Set(state.cobrancas.map(c => c.dataVencimento.slice(0, 7)))].sort();
  const selMes = document.getElementById('filterMes');
  const valMes = selMes.value;
  selMes.innerHTML = '<option value="">Todos os meses</option>' +
    meses.map(m => {
      const [y, mo] = m.split('-');
      return `<option value="${m}">${nomeMes(parseInt(mo))}/${y}</option>`;
    }).join('');
  selMes.value = valMes;
}

function renderCobrancas() {
  atualizarStatusAuto();
  popularFiltros();
  const search = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const status = document.getElementById('filterStatus')?.value || '';
  const clienteFiltro = document.getElementById('filterClienteCobranca')?.value || '';
  const catFiltro = document.getElementById('filterCategoria')?.value || '';
  const mesFiltro = document.getElementById('filterMes')?.value || '';

  let lista = state.cobrancas.filter(c => {
    const clienteNome = obterNomeClienteCobranca(c);
    const alvoBusca = `${c.descricao || ''} ${clienteNome} ${c.categoria || ''} ${c.observacoes || ''}`.toLowerCase();
    if (search && !alvoBusca.includes(search)) return false;
    if (status && c.status !== status) return false;
    if (clienteFiltro && c.clienteId !== clienteFiltro) return false;
    if (catFiltro && c.categoria !== catFiltro) return false;
    if (mesFiltro && !c.dataVencimento.startsWith(mesFiltro)) return false;
    return true;
  });

  lista = aplicarOrdenacao('cobrancas', lista);
  atualizarIndicadoresOrdenacao('cobrancas', ['descricao', 'cliente', 'categoria', 'dataVencimento', 'valor', 'recorrencia', 'status']);

  const totalPendente = lista.filter(c => c.status !== 'pago').reduce((s, c) => s + c.valor, 0);
  const totalPago = lista.filter(c => c.status === 'pago').reduce((s, c) => s + (c.valorPago || c.valor), 0);
  document.getElementById('table-summary').innerHTML = `
    <span>${lista.length} registro${lista.length !== 1 ? 's' : ''}</span>
    <span>Pendente/Vencido: <strong>${fmt(totalPendente)}</strong></span>
    <span>Pago (filtro): <strong>${fmt(totalPago)}</strong></span>
  `;

  // Resumo do mês atual — sobre todos os dados, independente de filtros
  const agora = new Date();
  const mesAtual = agora.getMonth() + 1;
  const anoAtual = agora.getFullYear();
  const mesLabel = agora.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  const pagasMes = state.cobrancas.filter(c => {
    if (c.status !== 'pago' || !c.dataPagamento) return false;
    const [y, m] = c.dataPagamento.split('-');
    return parseInt(m) === mesAtual && parseInt(y) === anoAtual;
  });
  const totalRecebidoMes = pagasMes.reduce((s, c) => s + (c.valorPago || c.valor), 0);
  const qtdPagasMes = pagasMes.length;

  const aReceberMes = state.cobrancas.filter(c => {
    if (c.status === 'pago') return false;
    if (!c.dataVencimento) return false;
    const [y, m] = c.dataVencimento.split('-');
    return parseInt(m) === mesAtual && parseInt(y) === anoAtual;
  });
  const totalAReceberMes = aReceberMes.reduce((s, c) => s + c.valor, 0);
  const qtdAReceberMes = aReceberMes.length;

  document.getElementById('resumo-mes').innerHTML = `
    <div class="resumo-mes-card resumo-mes-areceber">
      <div class="resumo-mes-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        A Receber em ${mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1)}
      </div>
      <div class="resumo-mes-valor">${fmt(totalAReceberMes)}</div>
      <div class="resumo-mes-sub">${qtdAReceberMes} cobrança${qtdAReceberMes !== 1 ? 's' : ''} pendente${qtdAReceberMes !== 1 ? 's' : ''}</div>
    </div>
    <div class="resumo-mes-card">
      <div class="resumo-mes-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Recebido em ${mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1)}
      </div>
      <div class="resumo-mes-valor">${fmt(totalRecebidoMes)}</div>
      <div class="resumo-mes-sub">${qtdPagasMes} baixa${qtdPagasMes !== 1 ? 's' : ''} registrada${qtdPagasMes !== 1 ? 's' : ''}</div>
    </div>
  `;

  const tbody = document.getElementById('tabelaBody');
  const empty = document.getElementById('emptyState');

  if (lista.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'flex';
  } else {
    empty.style.display = 'none';
    tbody.innerHTML = lista.map(c => `
      <tr>
        <td>
          <div style="font-weight:600">${c.descricao}</div>
          ${c.observacoes ? `<div style="font-size:11px;color:var(--text-muted)">${c.observacoes}</div>` : ''}
          ${c.status === 'pago' && c.dataPagamento ? `<div style="font-size:11px;color:var(--success)">Pago em ${fmtData(c.dataPagamento)}</div>` : ''}
        </td>
        <td style="white-space:nowrap;font-size:13px">${obterNomeClienteCobranca(c) || '<span style="color:var(--text-light)">—</span>'}</td>
        <td>
          <span style="display:inline-flex;align-items:center;gap:5px">
            <span style="width:8px;height:8px;border-radius:50%;background:${corCategoria(c.categoria)};display:inline-block"></span>
            ${c.categoria || '<span style="color:var(--text-muted)">—</span>'}
          </span>
        </td>
        <td style="white-space:nowrap">${fmtData(c.dataVencimento)}</td>
        <td style="font-weight:700;white-space:nowrap">${fmt(c.valor)}</td>
        <td>${c.recorrencia !== 'nenhuma' ? `<span class="rec-badge">${c.recorrencia}</span>` : '<span style="color:var(--text-light)">—</span>'}</td>
        <td><span class="badge badge-${c.status}">${c.status.charAt(0).toUpperCase() + c.status.slice(1)}</span></td>
        <td>
          <div class="actions">
            ${c.status !== 'pago' ? `<button class="btn-icon success" title="Dar baixa" onclick="abrirModalBaixa('${c.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </button>` : `
            <button class="btn-icon success" title="Gerar Recibo" onclick="gerarRecibo('${c.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            </button>
            <button class="btn-icon" title="Desfazer baixa" onclick="desfazerBaixa('${c.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </button>`}
            <button class="btn-icon" title="Editar" onclick="abrirModalCobranca('${c.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon danger" title="Excluir" onclick="excluirCobranca('${c.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }
}

// ===== MODAL COBRANÇA =====
function abrirModalCobranca(id) {
  const overlay = document.getElementById('modalOverlay');
  const form = document.getElementById('formCobranca');
  form.reset();
  document.getElementById('editId').value = '';
  document.getElementById('modalTitulo').textContent = 'Nova Cobrança';

  // Popular sugestões de clientes
  const listaClientes = document.getElementById('clientesCobrancaList');
  listaClientes.innerHTML = state.clientes.map(c => `<option value="${c.nome}"></option>`).join('');

  // Popular categorias no select
  const selCat = document.getElementById('fCategoria');
  selCat.innerHTML = '<option value="">Sem categoria</option>' +
    state.categorias.map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');

  // Default vencimento = hoje
  document.getElementById('fVencimento').value = hoje();

  // Mostrar/ocultar campo repetições
  document.getElementById('fRecorrencia').addEventListener('change', toggleRepetir);
  toggleRepetir();

  if (id) {
    const c = state.cobrancas.find(x => x.id === id);
    if (!c) return;
    document.getElementById('editId').value = c.id;
    document.getElementById('modalTitulo').textContent = 'Editar Cobrança';
    document.getElementById('fCliente').value = obterNomeClienteCobranca(c);
    document.getElementById('fDescricao').value = c.descricao;
    document.getElementById('fValor').value = fmtNumeroBR(c.valor);
    document.getElementById('fVencimento').value = c.dataVencimento;
    document.getElementById('fCategoria').value = c.categoria || '';
    document.getElementById('fRecorrencia').value = c.recorrencia || 'nenhuma';
    document.getElementById('fRepeticoes').value = c.repeticoes || 12;
    document.getElementById('fObservacoes').value = c.observacoes || '';
    toggleRepetir();
  }

  overlay.classList.add('open');
}

function toggleRepetir() {
  const rec = document.getElementById('fRecorrencia').value;
  const editId = document.getElementById('editId').value;
  const grupoRepetir = document.getElementById('grupoRepetir');
  // Mostrar só em modo novo (sem id) e quando há recorrência
  grupoRepetir.style.display = (rec !== 'nenhuma' && !editId) ? 'flex' : 'none';
}

function fecharModal(event) {
  if (event.target === document.getElementById('modalOverlay')) fecharModalForce();
}

function fecharModalForce() {
  document.getElementById('modalOverlay').classList.remove('open');
}

function salvarCobranca(event) {
  event.preventDefault();
  const id = document.getElementById('editId').value;
  const clienteInformado = document.getElementById('fCliente').value.trim();
  const clienteExistente = state.clientes.find(c => c.nome.toLowerCase() === clienteInformado.toLowerCase());
  const clienteId = clienteExistente ? clienteExistente.id : '';
  const clienteNome = clienteId ? clienteExistente.nome : clienteInformado;
  const descricao = document.getElementById('fDescricao').value.trim();
  const valor = parseMoedaBR(document.getElementById('fValor').value);
  const dataVencimento = document.getElementById('fVencimento').value;
  const categoria = document.getElementById('fCategoria').value;
  const recorrencia = document.getElementById('fRecorrencia').value;
  const repeticoes = parseInt(document.getElementById('fRepeticoes').value) || 1;
  const observacoes = document.getElementById('fObservacoes').value.trim();

  if (id) {
    // Editar
    const idx = state.cobrancas.findIndex(c => c.id === id);
    if (idx !== -1) {
      state.cobrancas[idx] = { ...state.cobrancas[idx], clienteId, clienteNome, descricao, valor, dataVencimento, categoria, recorrencia, observacoes };
      atualizarStatusAuto();
    }
    toast('Cobrança atualizada!', 'success');
  } else {
    // Criar (com recorrência)
    const qtd = recorrencia !== 'nenhuma' ? repeticoes : 1;
    let base = new Date(dataVencimento + 'T00:00:00');

    for (let i = 0; i < qtd; i++) {
      const d = new Date(base);
      const dStr = d.toISOString().slice(0, 10);
      const novaC = {
        id: uid(),
        clienteId,
        clienteNome,
        descricao,
        valor,
        dataVencimento: dStr,
        categoria,
        recorrencia,
        observacoes,
        status: 'pendente',
        dataPagamento: null,
        valorPago: null,
        criadoEm: new Date().toISOString(),
      };
      novaC.status = calcularStatus(novaC);
      state.cobrancas.push(novaC);

      // Avançar data conforme recorrência
      base = proximaData(base, recorrencia);
    }
    toast(`${qtd} cobrança${qtd !== 1 ? 's' : ''} criada${qtd !== 1 ? 's' : ''}!`, 'success');
  }

  salvarStorage();
  fecharModalForce();
  if (viewAtual === 'dashboard') renderDashboard();
  else if (viewAtual === 'cobrancas') renderCobrancas();
}

function proximaData(base, rec) {
  const d = new Date(base);
  switch (rec) {
    case 'semanal': d.setDate(d.getDate() + 7); break;
    case 'quinzenal': d.setDate(d.getDate() + 15); break;
    case 'mensal': d.setMonth(d.getMonth() + 1); break;
    case 'bimestral': d.setMonth(d.getMonth() + 2); break;
    case 'trimestral': d.setMonth(d.getMonth() + 3); break;
    case 'semestral': d.setMonth(d.getMonth() + 6); break;
    case 'anual': d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
}

function excluirCobranca(id) {
  const c = state.cobrancas.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`Excluir "${c.descricao}"?`)) return;
  state.cobrancas = state.cobrancas.filter(x => x.id !== id);
  salvarStorage();
  renderCobrancas();
  toast('Cobrança excluída');
}

// ===== BAIXA =====
function abrirModalBaixa(id, colecao) {
  baixaIdAtual = id;
  baixaColecao = colecao || 'cobrancas';
  const lista = baixaColecao === 'contaspagar' ? state.contasPagar : state.cobrancas;
  const item = lista.find(x => x.id === id);
  if (!item) return;
  document.getElementById('baixaDescricao').textContent = `${item.descricao} — Vencimento: ${fmtData(item.dataVencimento)}`;
  document.getElementById('baixaData').value = hoje();
  document.getElementById('baixaValor').value = fmtNumeroBR(item.valor);
  document.getElementById('baixaObs').value = '';
  document.getElementById('modalBaixaOverlay').classList.add('open');
}

function fecharModalBaixa(event) {
  if (event.target === document.getElementById('modalBaixaOverlay')) fecharModalBaixaForce();
}

function fecharModalBaixaForce() {
  document.getElementById('modalBaixaOverlay').classList.remove('open');
  baixaIdAtual = null;
}

function confirmarBaixa() {
  if (!baixaIdAtual) return;
  const lista = baixaColecao === 'contaspagar' ? state.contasPagar : state.cobrancas;
  const idx = lista.findIndex(c => c.id === baixaIdAtual);
  if (idx === -1) return;
  const dataPag = document.getElementById('baixaData').value;
  const valorPago = parseMoedaBR(document.getElementById('baixaValor').value);
  const obs = document.getElementById('baixaObs').value.trim();
  if (!dataPag || isNaN(valorPago) || valorPago <= 0) {
    toast('Preencha data e valor corretamente', 'error');
    return;
  }
  lista[idx].status = 'pago';
  lista[idx].dataPagamento = dataPag;
  lista[idx].valorPago = valorPago;
  if (obs) lista[idx].observacoes = obs;
  salvarStorage();
  fecharModalBaixaForce();
  toast('Pagamento registrado!', 'success');
  if (viewAtual === 'dashboard') renderDashboard();
  else if (baixaColecao === 'contaspagar') renderContasPagar();
  else renderCobrancas();
}

function desfazerBaixa(id) {
  const idx = state.cobrancas.findIndex(c => c.id === id);
  if (idx === -1) return;
  if (!confirm('Desfazer este pagamento?')) return;
  state.cobrancas[idx].status = 'pendente';
  state.cobrancas[idx].dataPagamento = null;
  state.cobrancas[idx].valorPago = null;
  atualizarStatusAuto();
  salvarStorage();
  renderCobrancas();
  toast('Baixa desfeita');
}

// ===== RELATÓRIOS =====
function renderRelatorios() {
  atualizarStatusAuto();
  atualizarStatusAutoCP();
  configurarFiltrosRelatorios();

  const inicio = document.getElementById('relDataInicio')?.value || '';
  const fim = document.getElementById('relDataFim')?.value || '';
  const modo = document.getElementById('relModo')?.value || 'ambos';
  const clienteFiltro = document.getElementById('relCliente')?.value || '';
  const tipoFiltro = document.getElementById('relTipoCobranca')?.value || '';
  const exibirCobrancas = modo === 'ambos' || modo === 'cobrancas';
  const exibirCustos = modo === 'ambos' || modo === 'custos';

  let lista = state.cobrancas.filter(c => {
    if (!dataNoIntervalo(c.dataVencimento, inicio, fim)) return false;
    if (clienteFiltro && c.clienteId !== clienteFiltro) return false;
    if (tipoFiltro && c.categoria !== tipoFiltro) return false;
    return true;
  });

  const totalGeral = lista.reduce((s, c) => s + c.valor, 0);
  const totalPago = lista.filter(c => c.status === 'pago').reduce((s, c) => s + (c.valorPago || c.valor), 0);
  const totalPendente = lista.filter(c => c.status === 'pendente').reduce((s, c) => s + c.valor, 0);
  const totalVencido = lista.filter(c => c.status === 'vencido').reduce((s, c) => s + c.valor, 0);
  const despesasPeriodo = state.despesas.filter(d => {
    if (!dataNoIntervalo(d.data, inicio, fim)) return false;
    if (clienteFiltro && d.clienteId !== clienteFiltro) return false;
    return true;
  });
  const contasPagarPeriodo = state.contasPagar.filter(cp => {
    if (!dataNoIntervalo(cp.dataVencimento, inicio, fim)) return false;
    if (tipoFiltro && cp.tipo !== tipoFiltro) return false;
    return true;
  });
  const totalCustos = despesasPeriodo.reduce((s, d) => s + d.valor, 0) + contasPagarPeriodo.reduce((s, cp) => s + cp.valor, 0);
  const resultadoLiquido = totalPago - totalCustos;
  const cards = [];
  if (exibirCobrancas) {
    cards.push(
      `<div class="card card-blue"><div class="card-label">Total do Período</div><div class="card-value">${fmt(totalGeral)}</div><div class="card-sub">${lista.length} cobranças</div></div>`,
      `<div class="card card-green"><div class="card-label">Recebido</div><div class="card-value">${fmt(totalPago)}</div><div class="card-sub">${lista.filter(c=>c.status==='pago').length} pagas</div></div>`,
      `<div class="card card-orange"><div class="card-label">Pendente</div><div class="card-value">${fmt(totalPendente)}</div><div class="card-sub">${lista.filter(c=>c.status==='pendente').length} cobranças</div></div>`,
      `<div class="card card-red"><div class="card-label">Vencido</div><div class="card-value">${fmt(totalVencido)}</div><div class="card-sub">${lista.filter(c=>c.status==='vencido').length} cobranças</div></div>`
    );
  }
  if (exibirCustos) {
    cards.push(
      `<div class="card card-orange"><div class="card-label">Custos</div><div class="card-value">${fmt(totalCustos)}</div><div class="card-sub">${despesasPeriodo.length + contasPagarPeriodo.length} lançamentos</div></div>`,
      `<div class="card ${resultadoLiquido >= 0 ? 'card-liquido-pos' : 'card-liquido-neg'}"><div class="card-label">Resultado Líquido</div><div class="card-value">${fmt(Math.abs(resultadoLiquido))}</div><div class="card-sub">${resultadoLiquido >= 0 ? 'saldo positivo' : 'déficit no período'}</div></div>`
    );
  }
  document.getElementById('relCardsGrid').innerHTML = cards.join('');
  document.getElementById('relCobrancasCharts').style.display = exibirCobrancas ? 'flex' : 'none';
  document.getElementById('relDetalhamentoCobrancas').style.display = exibirCobrancas ? 'block' : 'none';
  document.getElementById('relCustosSection').style.display = exibirCustos ? 'block' : 'none';
  document.getElementById('relContasPagarSection').style.display = exibirCustos ? 'block' : 'none';

  // Gráfico evolução mensal
  const buckets = {};
  lista.forEach(c => {
    const chaveMes = (c.dataVencimento || '').slice(0, 7);
    if (!chaveMes) return;
    if (!buckets[chaveMes]) buckets[chaveMes] = { pago: 0, pendente: 0 };
    if (c.status === 'pago') buckets[chaveMes].pago += c.valorPago || c.valor;
    else buckets[chaveMes].pendente += c.valor;
  });
  const mesesData = Object.keys(buckets).sort().map(chaveMes => {
    const [anoMes, mesMes] = chaveMes.split('-');
    return {
      label: `${nomeMes(parseInt(mesMes))}/${anoMes}`,
      pago: buckets[chaveMes].pago,
      pendente: buckets[chaveMes].pendente,
    };
  });

  if (chartEvolucao) chartEvolucao.destroy();
  const chartEvolucaoWrap = document.getElementById('chartEvolucaoWrap');
  if (chartEvolucaoWrap && exibirCobrancas) {
    if (mesesData.length === 0) {
      chartEvolucaoWrap.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center">Sem dados para o período</p>';
    } else {
      chartEvolucaoWrap.innerHTML = '<canvas id="chartEvolucao"></canvas>';
      const ctxEv = document.getElementById('chartEvolucao');
      chartEvolucao = new Chart(ctxEv, {
        type: 'bar',
        data: {
          labels: mesesData.map(m => m.label),
          datasets: [
            { label: 'Pago', data: mesesData.map(m => m.pago), backgroundColor: '#10b981', borderRadius: 4 },
            { label: 'Pendente/Vencido', data: mesesData.map(m => m.pendente), backgroundColor: '#f59e0b', borderRadius: 4 },
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 16, boxWidth: 12 } },
            tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` } }
          },
          scales: {
            x: { stacked: false, grid: { display: false } },
            y: { ticks: { callback: v => 'R$ ' + (v/1000).toFixed(0) + 'k' }, grid: { color: '#f0f2f5' } }
          }
        }
      });
    }
  }

  // Gráfico por categoria
  const cats = {};
  lista.forEach(c => {
    const k = c.categoria || 'Sem categoria';
    cats[k] = (cats[k] || 0) + c.valor;
  });
  const catLabels = Object.keys(cats);
  const catValues = Object.values(cats);
  const catColors = catLabels.map(l => corCategoria(l));

  if (chartRelCategoria) chartRelCategoria.destroy();
  const chartCategoriaWrap = document.getElementById('chartRelCategoriaWrap');
  if (chartCategoriaWrap && exibirCobrancas) {
    if (catLabels.length > 0) {
      chartCategoriaWrap.innerHTML = '<canvas id="chartRelCategoria"></canvas>';
      const ctxRC = document.getElementById('chartRelCategoria');
      chartRelCategoria = new Chart(ctxRC, {
        type: 'pie',
        data: { labels: catLabels, datasets: [{ data: catValues, backgroundColor: catColors, borderWidth: 2, borderColor: '#fff' }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12, boxWidth: 12 } },
            tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}` } }
          }
        }
      });
    } else {
      chartCategoriaWrap.innerHTML = '<p style="color:var(--text-muted);font-size:13px;text-align:center">Sem dados para o período</p>';
    }
  }

  // Tabela detalhamento
  const tbody = document.getElementById('relTableBody');
  const catMap = {};
  lista.forEach(c => {
    const k = c.categoria || 'Sem categoria';
    if (!catMap[k]) catMap[k] = { qtd: 0, pendente: 0, pago: 0, vencido: 0, total: 0 };
    catMap[k].qtd++;
    catMap[k].total += c.valor;
    if (c.status === 'pago') catMap[k].pago += c.valorPago || c.valor;
    else if (c.status === 'vencido') catMap[k].vencido += c.valor;
    else catMap[k].pendente += c.valor;
  });
  tbody.innerHTML = Object.entries(catMap).map(([cat, d]) => `
    <tr>
      <td><span style="display:inline-flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border-radius:50%;background:${corCategoria(cat)};display:inline-block"></span>${cat}</span></td>
      <td>${d.qtd}</td>
      <td style="color:var(--warning)">${fmt(d.pendente)}</td>
      <td style="color:var(--success)">${fmt(d.pago)}</td>
      <td style="color:var(--danger)">${fmt(d.vencido)}</td>
      <td style="font-weight:700">${fmt(d.total)}</td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">Sem dados para o período</td></tr>';

  const custosMap = {};
  despesasPeriodo.forEach(d => {
    const chave = 'Despesas de Cliente';
    if (!custosMap[chave]) custosMap[chave] = { qtd: 0, aberto: 0, pago: 0, total: 0 };
    custosMap[chave].qtd++;
    custosMap[chave].total += d.valor;
    if (d.status === 'faturado') custosMap[chave].pago += d.valor;
    else custosMap[chave].aberto += d.valor;
  });

  contasPagarPeriodo.forEach(cp => {
    const chave = cp.tipo || 'Contas a Pagar';
    if (!custosMap[chave]) custosMap[chave] = { qtd: 0, aberto: 0, pago: 0, total: 0 };
    custosMap[chave].qtd++;
    custosMap[chave].total += cp.valor;
    if (cp.status === 'pago') custosMap[chave].pago += cp.valorPago || cp.valor;
    else custosMap[chave].aberto += cp.valor;
  });

  document.getElementById('relCustosBody').innerHTML = Object.entries(custosMap).map(([tipo, d]) => `
    <tr>
      <td>${tipo}</td>
      <td>${d.qtd}</td>
      <td style="color:var(--warning)">${fmt(d.aberto)}</td>
      <td style="color:var(--success)">${fmt(d.pago)}</td>
      <td style="font-weight:700">${fmt(d.total)}</td>
    </tr>
  `).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Sem custos para o período</td></tr>';

  const contasPagarMap = {};
  contasPagarPeriodo.forEach(cp => {
    const tipo = cp.tipo || 'Sem tipo';
    if (!contasPagarMap[tipo]) contasPagarMap[tipo] = { qtd: 0, pendente: 0, pago: 0, vencido: 0, total: 0 };
    contasPagarMap[tipo].qtd++;
    contasPagarMap[tipo].total += cp.valor;
    if (cp.status === 'pago') contasPagarMap[tipo].pago += cp.valorPago || cp.valor;
    else if (cp.status === 'vencido') contasPagarMap[tipo].vencido += cp.valor;
    else contasPagarMap[tipo].pendente += cp.valor;
  });

  document.getElementById('relContasPagarBody').innerHTML = Object.entries(contasPagarMap).map(([tipo, d]) => `
    <tr>
      <td><span style="display:inline-flex;align-items:center;gap:6px"><span style="width:10px;height:10px;border-radius:50%;background:${corTipoCP(tipo)};display:inline-block"></span>${tipo}</span></td>
      <td>${d.qtd}</td>
      <td style="color:var(--warning)">${fmt(d.pendente)}</td>
      <td style="color:var(--success)">${fmt(d.pago)}</td>
      <td style="color:var(--danger)">${fmt(d.vencido)}</td>
      <td style="font-weight:700">${fmt(d.total)}</td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">Sem contas a pagar para o período</td></tr>';
}

// ===== CONFIGURAÇÕES =====
function renderConfiguracoes() {
  document.getElementById('diasAlerta').value = state.config.diasAlerta || 7;
  renderCategorias();
}

function renderCategorias() {
  const el = document.getElementById('listaCategorias');
  if (state.categorias.length === 0) {
    el.innerHTML = '<span style="color:var(--text-muted);font-size:13px">Nenhuma categoria</span>';
    return;
  }
  el.innerHTML = state.categorias.map((c, i) => `
    <span class="tag" style="background:${c.cor}">
      ${c.nome}
      <button class="tag-remove" onclick="removerCategoria(${i})" title="Remover">×</button>
    </span>
  `).join('');
}

function adicionarCategoria() {
  const nome = document.getElementById('novaCategoria').value.trim();
  const cor = document.getElementById('corCategoria').value;
  if (!nome) return;
  if (state.categorias.find(c => c.nome.toLowerCase() === nome.toLowerCase())) {
    toast('Categoria já existe', 'error');
    return;
  }
  state.categorias.push({ nome, cor });
  salvarStorage();
  renderCategorias();
  popularCategoriasForms();
  document.getElementById('novaCategoria').value = '';
  toast('Categoria adicionada!', 'success');
}

function removerCategoria(idx) {
  const cat = state.categorias[idx];
  if (!confirm(`Remover categoria "${cat.nome}"?`)) return;
  state.categorias.splice(idx, 1);
  salvarStorage();
  renderCategorias();
  toast('Categoria removida');
}

function salvarConfig() {
  const dias = parseInt(document.getElementById('diasAlerta').value);
  if (!dias || dias < 1) { toast('Informe um número válido de dias', 'error'); return; }
  state.config.diasAlerta = dias;
  salvarStorage();
  toast('Configurações salvas!', 'success');
}

function popularCategoriasForms() {
  const sel = document.getElementById('fCategoria');
  if (sel) {
    sel.innerHTML = '<option value="">Sem categoria</option>' +
      state.categorias.map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');
  }
}

// ===== EXPORT / IMPORT =====
function exportarCSV() {
  atualizarStatusAuto();
  const search = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const status = document.getElementById('filterStatus')?.value || '';
  const catFiltro = document.getElementById('filterCategoria')?.value || '';
  const mesFiltro = document.getElementById('filterMes')?.value || '';

  let lista = state.cobrancas.filter(c => {
    if (search && !c.descricao.toLowerCase().includes(search)) return false;
    if (status && c.status !== status) return false;
    if (catFiltro && c.categoria !== catFiltro) return false;
    if (mesFiltro && !c.dataVencimento.startsWith(mesFiltro)) return false;
    return true;
  });

  const header = 'Descrição;Categoria;Vencimento;Valor;Recorrência;Status;Data Pagamento;Valor Pago;Observações';
  const rows = lista.map(c => [
    `"${c.descricao}"`,
    c.categoria || '',
    fmtData(c.dataVencimento),
    c.valor.toFixed(2).replace('.', ','),
    c.recorrencia || 'nenhuma',
    c.status,
    c.dataPagamento ? fmtData(c.dataPagamento) : '',
    c.valorPago ? c.valorPago.toFixed(2).replace('.', ',') : '',
    `"${c.observacoes || ''}"`
  ].join(';'));

  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `financeiro-ng-${hoje()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV exportado!', 'success');
}

function exportarDados() {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `financeiro-ng-backup-${hoje()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Backup exportado!', 'success');
}

function importarDados(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const dados = JSON.parse(e.target.result);
      if (!Array.isArray(dados.cobrancas)) throw new Error('Formato inválido');
      if (!confirm(`Importar ${dados.cobrancas.length} cobranças? Os dados atuais serão substituídos.`)) return;
      state.cobrancas = dados.cobrancas;
      state.categorias = dados.categorias || state.categorias;
      state.config = { ...state.config, ...(dados.config || {}) };
      salvarStorage();
      navegarPara('dashboard');
      toast('Dados importados!', 'success');
    } catch (err) {
      toast('Arquivo inválido', 'error');
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

function limparDados() {
  if (!confirm('Apagar TODOS os dados? Esta ação não pode ser desfeita.')) return;
  state.cobrancas = [];
  state.clientes = [];
  state.despesas = [];
  state.contasPagar = [];
  state.contadores = { notaDebito: 0, recibo: 0 };
  state.categorias = [
    { nome: 'Honorários de Êxito',   cor: '#6366f1' },
    { nome: 'Honorários Mensais',    cor: '#8b5cf6' },
    { nome: 'Honorários Pro-Labore', cor: '#a855f7' },
    { nome: 'Custas',                cor: '#3b82f6' },
    { nome: 'Diligências',           cor: '#06b6d4' },
    { nome: 'Impostos',              cor: '#ef4444' },
    { nome: 'Outros',                cor: '#6b7280' },
  ];
  salvarStorage();
  navegarPara('dashboard');
  toast('Dados apagados');
}

function imprimirRelatorio() {
  window.print();
}

// ===== TOAST =====
let toastTimer = null;
function toast(msg, tipo = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (tipo ? ' ' + tipo : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3000);
}

// ===== DADOS DE DEMONSTRAÇÃO =====
function carregarDemo() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = agora.getMonth() + 1;

  function d(diaOffset, mOffset = 0) {
    const dt = new Date(agora);
    dt.setMonth(dt.getMonth() + mOffset);
    dt.setDate(diaOffset);
    return dt.toISOString().slice(0, 10);
  }

  state.cobrancas = [
    { id: uid(), descricao: 'Aluguel Comercial', valor: 3500, dataVencimento: d(5), categoria: 'Aluguel', recorrencia: 'mensal', status: 'pendente', dataPagamento: null, valorPago: null, observacoes: '', criadoEm: new Date().toISOString() },
    { id: uid(), descricao: 'Conta de Energia', valor: 480.50, dataVencimento: d(10), categoria: 'Utilities', recorrencia: 'mensal', status: 'pendente', dataPagamento: null, valorPago: null, observacoes: '', criadoEm: new Date().toISOString() },
    { id: uid(), descricao: 'Internet Fibra', valor: 129.90, dataVencimento: d(15), categoria: 'Utilities', recorrencia: 'mensal', status: 'pendente', dataPagamento: null, valorPago: null, observacoes: '', criadoEm: new Date().toISOString() },
    { id: uid(), descricao: 'Software Gestão', valor: 299, dataVencimento: d(20), categoria: 'Serviços', recorrencia: 'mensal', status: 'pendente', dataPagamento: null, valorPago: null, observacoes: 'Renovação anual', criadoEm: new Date().toISOString() },
    { id: uid(), descricao: 'Alvará Municipal', valor: 850, dataVencimento: d(-3), categoria: 'Impostos', recorrencia: 'anual', status: 'vencido', dataPagamento: null, valorPago: null, observacoes: '', criadoEm: new Date().toISOString() },
    { id: uid(), descricao: 'DAS Simples Nacional', valor: 620, dataVencimento: d(-8), categoria: 'Impostos', recorrencia: 'mensal', status: 'vencido', dataPagamento: null, valorPago: null, observacoes: '', criadoEm: new Date().toISOString() },
    { id: uid(), descricao: 'Manutenção Ar-Cond', valor: 350, dataVencimento: d(-15, -1), categoria: 'Serviços', recorrencia: 'nenhuma', status: 'pago', dataPagamento: d(-14, -1), valorPago: 350, observacoes: '', criadoEm: new Date().toISOString() },
    { id: uid(), descricao: 'Aluguel Comercial', valor: 3500, dataVencimento: d(5, -1), categoria: 'Aluguel', recorrencia: 'mensal', status: 'pago', dataPagamento: d(4, -1), valorPago: 3500, observacoes: '', criadoEm: new Date().toISOString() },
    { id: uid(), descricao: 'Conta de Energia', valor: 510, dataVencimento: d(10, -1), categoria: 'Utilities', recorrencia: 'mensal', status: 'pago', dataPagamento: d(9, -1), valorPago: 510, observacoes: '', criadoEm: new Date().toISOString() },
    { id: uid(), descricao: 'Aluguel Comercial', valor: 3500, dataVencimento: d(5, 1), categoria: 'Aluguel', recorrencia: 'mensal', status: 'pendente', dataPagamento: null, valorPago: null, observacoes: '', criadoEm: new Date().toISOString() },
    { id: uid(), descricao: 'Seguro Empresarial', valor: 1200, dataVencimento: d(28), categoria: 'Outros', recorrencia: 'anual', status: 'pendente', dataPagamento: null, valorPago: null, observacoes: '', criadoEm: new Date().toISOString() },
    { id: uid(), descricao: 'Contador', valor: 750, dataVencimento: d(25), categoria: 'Serviços', recorrencia: 'mensal', status: 'pendente', dataPagamento: null, valorPago: null, observacoes: '', criadoEm: new Date().toISOString() },
  ];
  atualizarStatusAuto();
  salvarStorage();
}

// ===== CONTAS A PAGAR =====
const TIPOS_CP = {
  'Prestadores de Serviço': '#8b5cf6',
  'Tributos / Impostos':    '#ef4444',
  'Notas Fiscais':          '#3b82f6',
  'Folha de Pagamento':     '#f59e0b',
  'Aluguel / Locações':     '#6366f1',
  'Outros':                 '#6b7280',
};

function corTipoCP(tipo) {
  return TIPOS_CP[tipo] || '#6b7280';
}

function calcularStatusCP(cp) {
  if (cp.status === 'pago') return 'pago';
  return diasAte(cp.dataVencimento) < 0 ? 'vencido' : 'pendente';
}

function atualizarStatusAutoCP() {
  state.contasPagar.forEach(cp => {
    if (cp.status !== 'pago') cp.status = calcularStatusCP(cp);
  });
}

function renderContasPagar() {
  atualizarStatusAutoCP();
  const search = (document.getElementById('searchCP')?.value || '').toLowerCase();
  const statusF = document.getElementById('filterStatusCP')?.value || '';
  const tipoF = document.getElementById('filterTipoCP')?.value || '';
  const mesF = document.getElementById('filterMesCP')?.value || '';
  const dataInicioF = document.getElementById('filterDataInicioCP')?.value || '';
  const dataFimF = document.getElementById('filterDataFimCP')?.value || '';

  let lista = state.contasPagar.filter(cp => {
    const alvoBusca = `${cp.descricao || ''} ${cp.tipo || ''} ${cp.observacoes || ''}`.toLowerCase();
    if (search && !alvoBusca.includes(search)) return false;
    if (statusF && cp.status !== statusF) return false;
    if (tipoF && cp.tipo !== tipoF) return false;
    if (mesF && !cp.dataVencimento.startsWith(mesF)) return false;
    if (!dataNoIntervalo(cp.dataVencimento, dataInicioF, dataFimF)) return false;
    return true;
  });
  lista = aplicarOrdenacao('contaspagar', lista);
  atualizarIndicadoresOrdenacao('contaspagar', ['descricao', 'tipo', 'dataVencimento', 'valor', 'recorrencia', 'status']);

  const totalPend = lista.filter(cp => cp.status !== 'pago').reduce((s, cp) => s + cp.valor, 0);
  const totalPago = lista.filter(cp => cp.status === 'pago').reduce((s, cp) => s + (cp.valorPago || cp.valor), 0);

  // Popular filtro de meses
  const meses = [...new Set(state.contasPagar.map(cp => cp.dataVencimento.slice(0, 7)))].sort();
  const selMes = document.getElementById('filterMesCP');
  if (selMes) {
    const v = selMes.value;
    selMes.innerHTML = '<option value="">Todos os meses</option>' +
      meses.map(m => { const [y,mo] = m.split('-'); return `<option value="${m}">${nomeMes(parseInt(mo))}/${y}</option>`; }).join('');
    selMes.value = v;
  }

  document.getElementById('cp-summary').innerHTML = `
    <span>${lista.length} registro${lista.length !== 1 ? 's' : ''}</span>
    <span>Pendente/Vencido: <strong>${fmt(totalPend)}</strong></span>
    <span>Pago (filtro): <strong>${fmt(totalPago)}</strong></span>
  `;

  // Resumo do mês atual
  const agora = new Date();
  const mAtual = agora.getMonth() + 1, aAtual = agora.getFullYear();
  const pagasMes = state.contasPagar.filter(cp => {
    if (cp.status !== 'pago' || !cp.dataPagamento) return false;
    const [y, m] = cp.dataPagamento.split('-');
    return parseInt(m) === mAtual && parseInt(y) === aAtual;
  });
  const totalPagoMes = pagasMes.reduce((s, cp) => s + (cp.valorPago || cp.valor), 0);
  const mesLabel = agora.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
  document.getElementById('resumo-mes-cp').innerHTML = `
    <div class="resumo-mes-card resumo-pagar">
      <div class="resumo-mes-label">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Pago em ${mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1)}
      </div>
      <div class="resumo-mes-valor">${fmt(totalPagoMes)}</div>
      <div class="resumo-mes-sub">${pagasMes.length} pagamento${pagasMes.length !== 1 ? 's' : ''} realizado${pagasMes.length !== 1 ? 's' : ''}</div>
    </div>
  `;

  const tbody = document.getElementById('tabelaCPBody');
  const empty = document.getElementById('emptyStateCP');
  if (lista.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'flex';
  } else {
    empty.style.display = 'none';
    tbody.innerHTML = lista.map(cp => `
      <tr>
        <td>
          <div style="font-weight:600">${cp.descricao}</div>
          ${cp.observacoes ? `<div style="font-size:11px;color:var(--text-muted)">${cp.observacoes}</div>` : ''}
          ${cp.status === 'pago' && cp.dataPagamento ? `<div style="font-size:11px;color:var(--success)">Pago em ${fmtData(cp.dataPagamento)}</div>` : ''}
        </td>
        <td>
          <span style="display:inline-flex;align-items:center;gap:5px">
            <span style="width:8px;height:8px;border-radius:50%;background:${corTipoCP(cp.tipo)};display:inline-block"></span>
            ${cp.tipo || '<span style="color:var(--text-light)">—</span>'}
          </span>
        </td>
        <td style="white-space:nowrap">${fmtData(cp.dataVencimento)}</td>
        <td style="font-weight:700;white-space:nowrap">${fmt(cp.valor)}</td>
        <td>${cp.recorrencia !== 'nenhuma' ? `<span class="rec-badge">${cp.recorrencia}</span>` : '<span style="color:var(--text-light)">—</span>'}</td>
        <td><span class="badge badge-${cp.status}">${cp.status.charAt(0).toUpperCase() + cp.status.slice(1)}</span></td>
        <td>
          <div class="actions">
            ${cp.status !== 'pago'
              ? `<button class="btn-icon success" title="Registrar pagamento" onclick="abrirModalBaixa('${cp.id}','contaspagar')">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                 </button>`
              : `<button class="btn-icon" title="Desfazer pagamento" onclick="desfazerBaixaCP('${cp.id}')">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                 </button>`}
            <button class="btn-icon" title="Editar" onclick="abrirModalContaPagar('${cp.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon danger" title="Excluir" onclick="excluirContaPagar('${cp.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }
}

function abrirModalContaPagar(id) {
  document.getElementById('formContaPagar').reset();
  document.getElementById('editCPId').value = '';
  document.getElementById('modalCPTitulo').textContent = 'Nova Conta a Pagar';
  document.getElementById('cpVencimento').value = hoje();
  document.getElementById('cpRecorrencia').addEventListener('change', toggleRepetirCP);
  toggleRepetirCP();
  if (id) {
    const cp = state.contasPagar.find(x => x.id === id);
    if (!cp) return;
    document.getElementById('editCPId').value = cp.id;
    document.getElementById('modalCPTitulo').textContent = 'Editar Conta a Pagar';
    document.getElementById('cpDescricao').value = cp.descricao;
    document.getElementById('cpTipo').value = cp.tipo || '';
    document.getElementById('cpVencimento').value = cp.dataVencimento;
    document.getElementById('cpValor').value = fmtNumeroBR(cp.valor);
    document.getElementById('cpRecorrencia').value = cp.recorrencia || 'nenhuma';
    document.getElementById('cpObservacoes').value = cp.observacoes || '';
    toggleRepetirCP();
  }
  document.getElementById('modalCPOverlay').classList.add('open');
}

function toggleRepetirCP() {
  const rec = document.getElementById('cpRecorrencia').value;
  const editId = document.getElementById('editCPId').value;
  document.getElementById('grupoRepetirCP').style.display = (rec !== 'nenhuma' && !editId) ? 'flex' : 'none';
}

function fecharModalContaPagar(event) {
  if (event.target === document.getElementById('modalCPOverlay')) fecharModalCPForce();
}

function fecharModalCPForce() {
  document.getElementById('modalCPOverlay').classList.remove('open');
}

function salvarContaPagar(event) {
  event.preventDefault();
  const id = document.getElementById('editCPId').value;
  const descricao = document.getElementById('cpDescricao').value.trim();
  const tipo = document.getElementById('cpTipo').value;
  const dataVencimento = document.getElementById('cpVencimento').value;
  const valor = parseMoedaBR(document.getElementById('cpValor').value);
  const recorrencia = document.getElementById('cpRecorrencia').value;
  const repeticoes = parseInt(document.getElementById('cpRepeticoes').value) || 1;
  const observacoes = document.getElementById('cpObservacoes').value.trim();

  if (id) {
    const idx = state.contasPagar.findIndex(cp => cp.id === id);
    if (idx !== -1) {
      state.contasPagar[idx] = { ...state.contasPagar[idx], descricao, tipo, dataVencimento, valor, recorrencia, observacoes };
      atualizarStatusAutoCP();
    }
    toast('Conta atualizada!', 'success');
  } else {
    const qtd = recorrencia !== 'nenhuma' ? repeticoes : 1;
    let base = new Date(dataVencimento + 'T00:00:00');
    for (let i = 0; i < qtd; i++) {
      const dStr = base.toISOString().slice(0, 10);
      const novaCP = { id: uid(), descricao, tipo, dataVencimento: dStr, valor, recorrencia, observacoes, status: 'pendente', dataPagamento: null, valorPago: null, criadoEm: new Date().toISOString() };
      novaCP.status = calcularStatusCP(novaCP);
      state.contasPagar.push(novaCP);
      base = proximaData(base, recorrencia);
    }
    toast(`${qtd > 1 ? qtd + ' contas criadas' : 'Conta criada'}!`, 'success');
  }
  salvarStorage();
  fecharModalCPForce();
  if (viewAtual === 'contaspagar') renderContasPagar();
  if (viewAtual === 'dashboard') renderDashboard();
}

function excluirContaPagar(id) {
  const cp = state.contasPagar.find(x => x.id === id);
  if (!cp) return;
  if (!confirm(`Excluir "${cp.descricao}"?`)) return;
  state.contasPagar = state.contasPagar.filter(x => x.id !== id);
  salvarStorage();
  renderContasPagar();
  toast('Conta excluída');
}

function desfazerBaixaCP(id) {
  const idx = state.contasPagar.findIndex(cp => cp.id === id);
  if (idx === -1) return;
  if (!confirm('Desfazer este pagamento?')) return;
  state.contasPagar[idx].status = 'pendente';
  state.contasPagar[idx].dataPagamento = null;
  state.contasPagar[idx].valorPago = null;
  atualizarStatusAutoCP();
  salvarStorage();
  renderContasPagar();
  toast('Baixa desfeita');
}

// ===== CLIENTES =====
function nomeCliente(id) {
  if (!id) return '<span style="color:var(--text-light)">—</span>';
  const c = state.clientes.find(c => c.id === id);
  return c ? c.nome : '<span style="color:var(--text-light)">—</span>';
}

function nomeClienteTexto(id) {
  if (!id) return '';
  const c = state.clientes.find(cliente => cliente.id === id);
  return c ? c.nome : '';
}

function obterNomeClienteCobranca(cobranca) {
  return nomeClienteTexto(cobranca.clienteId) || cobranca.clienteNome || '';
}

function dataNoIntervalo(data, inicio, fim) {
  if (!data) return false;
  if (inicio && data < inicio) return false;
  if (fim && data > fim) return false;
  return true;
}

function configurarFiltrosRelatorios() {
  const relCliente = document.getElementById('relCliente');
  if (relCliente) {
    const valorAtual = relCliente.value;
    relCliente.innerHTML = '<option value="">Todos os clientes</option>' +
      state.clientes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    relCliente.value = valorAtual;
  }

  const relTipo = document.getElementById('relTipoCobranca');
  if (relTipo) {
    const modo = document.getElementById('relModo')?.value || 'ambos';
    const valorAtual = relTipo.value;
    const tiposCobranca = [...new Set(state.cobrancas.map(c => c.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const tiposCustos = [...new Set(state.contasPagar.map(cp => cp.tipo).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const tipos = modo === 'cobrancas'
      ? tiposCobranca
      : modo === 'custos'
        ? tiposCustos
        : [...new Set([...tiposCobranca, ...tiposCustos])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const placeholder = modo === 'cobrancas'
      ? 'Todas as categorias'
      : modo === 'custos'
        ? 'Todos os tipos de custo'
        : 'Todos os tipos';

    relTipo.innerHTML = `<option value="">${placeholder}</option>` +
      tipos.map(tipo => `<option value="${tipo}">${tipo}</option>`).join('');
    relTipo.value = tipos.includes(valorAtual) ? valorAtual : '';
  }

  const dataInicio = document.getElementById('relDataInicio');
  const dataFim = document.getElementById('relDataFim');
  const datasBase = state.cobrancas.map(c => c.dataVencimento).filter(Boolean).sort();
  const hojeStr = hoje();

  if (dataInicio && !dataInicio.value) dataInicio.value = datasBase[0] || hojeStr;
  if (dataFim && !dataFim.value) dataFim.value = datasBase[datasBase.length - 1] || hojeStr;
}

function popularClientesForms() {
  const opts = '<option value="">Sem cliente</option>' +
    state.clientes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
  const selF = document.getElementById('fCliente');
  if (selF) { const v = selF.value; selF.innerHTML = opts; selF.value = v; }

  const optsD = '<option value="">Selecione um cliente</option>' +
    state.clientes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
  const selD = document.getElementById('dCliente');
  if (selD) { const v = selD.value; selD.innerHTML = optsD; selD.value = v; }

  const optsFiltro = '<option value="">Todos os clientes</option>' +
    state.clientes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
  const selFiltro = document.getElementById('filterClienteDespesa');
  if (selFiltro) { const v = selFiltro.value; selFiltro.innerHTML = optsFiltro; selFiltro.value = v; }

  const mesesDespesas = [...new Set(state.despesas.map(d => (d.data || '').slice(0, 7)).filter(Boolean))].sort();
  const selMesDesp = document.getElementById('filterMesDespesa');
  if (selMesDesp) {
    const valMes = selMesDesp.value;
    selMesDesp.innerHTML = '<option value="">Todos os meses</option>' +
      mesesDespesas.map(m => {
        const [y, mo] = m.split('-');
        return `<option value="${m}">${nomeMes(parseInt(mo))}/${y}</option>`;
      }).join('');
    selMesDesp.value = valMes;
  }
}

function renderClientes() {
  const search = (document.getElementById('searchClientes')?.value || '').toLowerCase();
  let lista = state.clientes.filter(c =>
    !search || c.nome.toLowerCase().includes(search) || (c.cpf_cnpj || '').includes(search)
  );

  const tbody = document.getElementById('tabelaClientesBody');
  const empty = document.getElementById('emptyStateClientes');

  if (lista.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'flex';
  } else {
    empty.style.display = 'none';
    tbody.innerHTML = lista.map(c => {
      const qtdCob = state.cobrancas.filter(x => x.clienteId === c.id && x.status !== 'pago').length;
      const qtdDesp = state.despesas.filter(x => x.clienteId === c.id && x.status === 'pendente').length;
      const totalPend = state.cobrancas.filter(x => x.clienteId === c.id && x.status !== 'pago').reduce((s, x) => s + x.valor, 0)
                      + state.despesas.filter(x => x.clienteId === c.id && x.status === 'pendente').reduce((s, x) => s + x.valor, 0);
      return `<tr>
        <td>
          <div style="font-weight:600">${c.nome}</div>
          ${(qtdCob + qtdDesp) > 0 ? `<div style="font-size:11px;color:var(--text-muted)">${qtdCob} cobrança${qtdCob !== 1 ? 's' : ''} · ${qtdDesp} despesa${qtdDesp !== 1 ? 's' : ''} pendente${qtdDesp !== 1 ? 's' : ''} · ${fmt(totalPend)}</div>` : ''}
        </td>
        <td>${c.cpf_cnpj || '<span style="color:var(--text-light)">—</span>'}</td>
        <td>${c.email || '<span style="color:var(--text-light)">—</span>'}</td>
        <td>${c.telefone || '<span style="color:var(--text-light)">—</span>'}</td>
        <td>
          <div class="actions">
            <button class="btn-icon" title="Nota de Débito" onclick="gerarNotaDebito('${c.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </button>
            <button class="btn-icon" title="Nova Despesa" onclick="abrirModalDespesa(null,'${c.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </button>
            <button class="btn-icon" title="Editar" onclick="abrirModalCliente('${c.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon danger" title="Excluir" onclick="excluirCliente('${c.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }
}

function abrirModalCliente(id) {
  document.getElementById('formCliente').reset();
  document.getElementById('editClienteId').value = '';
  document.getElementById('modalClienteTitulo').textContent = 'Novo Cliente';
  if (id) {
    const c = state.clientes.find(x => x.id === id);
    if (!c) return;
    document.getElementById('editClienteId').value = c.id;
    document.getElementById('modalClienteTitulo').textContent = 'Editar Cliente';
    document.getElementById('cNome').value = c.nome;
    document.getElementById('ccpf_cnpj').value = c.cpf_cnpj || '';
    document.getElementById('cTelefone').value = c.telefone || '';
    document.getElementById('cEmail').value = c.email || '';
    document.getElementById('cEndereco').value = c.endereco || '';
  }
  document.getElementById('modalClienteOverlay').classList.add('open');
}

function fecharModalCliente(event) {
  if (event.target === document.getElementById('modalClienteOverlay')) fecharModalClienteForce();
}

function fecharModalClienteForce() {
  document.getElementById('modalClienteOverlay').classList.remove('open');
}

async function salvarCliente(event) {
  event.preventDefault();

  const id = document.getElementById('editClienteId').value;

  const { data: sessao } = await supabaseClient.auth.getSession();
  const userId = sessao.session.user.id;

  const dados = {
    nome: document.getElementById('cNome').value.trim(),
    cpf_cnpj: document.getElementById('cCpfCnpj').value.trim(),
    telefone: document.getElementById('cTelefone').value.trim(),
    email: document.getElementById('cEmail').value.trim(),
    endereco: document.getElementById('cEndereco').value.trim(),
    user_id: userId
  };

if (id) {
const { error } = await supabaseClient
.from('clientes')
.update(dados)
.eq('id', id);


if (error) {
  console.error(error);
  toast('Erro ao atualizar cliente');
  return;
}

toast('Cliente atualizado!', 'success');


} else {
const { error } = await supabaseClient
.from('clientes')
.insert([dados]);
console.log('Dados enviados:', dados);
console.log('Erro insert:', error);


if (error) {
  console.error(error);
  toast('Erro ao cadastrar cliente');
  return;
}

toast('Cliente cadastrado!', 'success');

}

await carregarClientesSupabase();
popularClientesForms();
renderClientes();
fecharModalClienteForce();
}


function excluirCliente(id) {
  const c = state.clientes.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`Excluir cliente "${c.nome}"?`)) return;
  state.clientes = state.clientes.filter(x => x.id !== id);
  salvarStorage();
  popularClientesForms();
  renderClientes();
  toast('Cliente excluído');
}

// ===== DESPESAS =====
function renderDespesas() {
  popularClientesForms();
  const search = (document.getElementById('searchDespesas')?.value || '').toLowerCase();
  const clienteFiltro = document.getElementById('filterClienteDespesa')?.value || '';
  const statusFiltro = document.getElementById('filterStatusDespesa')?.value || '';
  const mesFiltro = document.getElementById('filterMesDespesa')?.value || '';
  const dataInicioFiltro = document.getElementById('filterDataInicioDespesa')?.value || '';
  const dataFimFiltro = document.getElementById('filterDataFimDespesa')?.value || '';

  let lista = state.despesas.filter(d => {
    const clienteNome = nomeClienteTexto(d.clienteId);
    const alvoBusca = `${clienteNome} ${d.descricao || ''} ${d.observacoes || ''}`.toLowerCase();
    if (search && !alvoBusca.includes(search)) return false;
    if (clienteFiltro && d.clienteId !== clienteFiltro) return false;
    if (statusFiltro && d.status !== statusFiltro) return false;
    if (mesFiltro && !(d.data || '').startsWith(mesFiltro)) return false;
    if (!dataNoIntervalo(d.data, dataInicioFiltro, dataFimFiltro)) return false;
    return true;
  });

  lista = aplicarOrdenacao('despesas', lista);
  atualizarIndicadoresOrdenacao('despesas', ['cliente', 'descricao', 'data', 'valor', 'status']);

  const totalPend = lista.filter(d => d.status === 'pendente').reduce((s, d) => s + d.valor, 0);
  const totalFat = lista.filter(d => d.status === 'faturado').reduce((s, d) => s + d.valor, 0);
  document.getElementById('despesas-summary').innerHTML = `
    <span>${lista.length} registro${lista.length !== 1 ? 's' : ''}</span>
    <span>Pendente: <strong>${fmt(totalPend)}</strong></span>
    <span>Faturado: <strong>${fmt(totalFat)}</strong></span>
  `;

  const tbody = document.getElementById('tabelaDespesasBody');
  const empty = document.getElementById('emptyStateDespesas');

  if (lista.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'flex';
  } else {
    empty.style.display = 'none';
    tbody.innerHTML = lista.map(d => `
      <tr>
        <td style="font-weight:600">${nomeCliente(d.clienteId)}</td>
        <td>
          <div>${d.descricao}</div>
          ${d.observacoes ? `<div style="font-size:11px;color:var(--text-muted)">${d.observacoes}</div>` : ''}
        </td>
        <td style="white-space:nowrap">${fmtData(d.data)}</td>
        <td style="font-weight:700;white-space:nowrap">${fmt(d.valor)}</td>
        <td><span class="badge ${d.status === 'pendente' ? 'badge-pendente' : 'badge-pago'}">${d.status === 'faturado' ? 'Faturado' : 'Pendente'}</span></td>
        <td>
          <div class="actions">
            ${d.status === 'pendente' ? `<button class="btn-icon success" title="Marcar como faturado" onclick="marcarDespesaFaturada('${d.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </button>` : ''}
            <button class="btn-icon" title="Editar" onclick="abrirModalDespesa('${d.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon danger" title="Excluir" onclick="excluirDespesa('${d.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }
}

function abrirModalDespesa(id, preClienteId) {
  document.getElementById('formDespesa').reset();
  document.getElementById('editDespesaId').value = '';
  document.getElementById('modalDespesaTitulo').textContent = 'Nova Despesa';
  const selD = document.getElementById('dCliente');
  selD.innerHTML = '<option value="">Selecione um cliente</option>' +
    state.clientes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
  document.getElementById('dData').value = hoje();
  if (preClienteId) selD.value = preClienteId;
  if (id) {
    const d = state.despesas.find(x => x.id === id);
    if (!d) return;
    document.getElementById('editDespesaId').value = d.id;
    document.getElementById('modalDespesaTitulo').textContent = 'Editar Despesa';
    selD.value = d.clienteId;
    document.getElementById('dDescricao').value = d.descricao;
    document.getElementById('dData').value = d.data;
    document.getElementById('dValor').value = fmtNumeroBR(d.valor);
    document.getElementById('dObservacoes').value = d.observacoes || '';
  }
  document.getElementById('modalDespesaOverlay').classList.add('open');
}

function fecharModalDespesa(event) {
  if (event.target === document.getElementById('modalDespesaOverlay')) fecharModalDespesaForce();
}

function fecharModalDespesaForce() {
  document.getElementById('modalDespesaOverlay').classList.remove('open');
}

function salvarDespesa(event) {
  event.preventDefault();
  const id = document.getElementById('editDespesaId').value;
  const dados = {
    clienteId: document.getElementById('dCliente').value,
    descricao: document.getElementById('dDescricao').value.trim(),
    data: document.getElementById('dData').value,
    valor: parseMoedaBR(document.getElementById('dValor').value),
    observacoes: document.getElementById('dObservacoes').value.trim(),
  };
  if (id) {
    const idx = state.despesas.findIndex(d => d.id === id);
    if (idx !== -1) state.despesas[idx] = { ...state.despesas[idx], ...dados };
    toast('Despesa atualizada!', 'success');
  } else {
    state.despesas.push({ id: uid(), ...dados, status: 'pendente', criadoEm: new Date().toISOString() });
    toast('Despesa registrada!', 'success');
  }
  salvarStorage();
  fecharModalDespesaForce();
  if (viewAtual === 'despesas') renderDespesas();
  if (viewAtual === 'clientes') renderClientes();
}

function excluirDespesa(id) {
  if (!confirm('Excluir esta despesa?')) return;
  state.despesas = state.despesas.filter(d => d.id !== id);
  salvarStorage();
  renderDespesas();
  toast('Despesa excluída');
}

function marcarDespesaFaturada(id) {
  const idx = state.despesas.findIndex(d => d.id === id);
  if (idx === -1) return;
  state.despesas[idx].status = 'faturado';
  salvarStorage();
  renderDespesas();
  toast('Despesa marcada como faturada', 'success');
}

// ===== NOTA DE DÉBITO =====
function gerarNotaDebito(clienteId) {
  const cliente = state.clientes.find(c => c.id === clienteId);
  if (!cliente) return;

  const despesas = state.despesas.filter(d => d.clienteId === clienteId && d.status === 'pendente');
  const cobrancas = state.cobrancas.filter(c => c.clienteId === clienteId && c.status !== 'pago');

  const itens = [
    ...cobrancas.map(c => ({ descricao: c.descricao, data: c.dataVencimento, valor: c.valor, tipo: 'Honorários' })),
    ...despesas.map(d => ({ descricao: d.descricao, data: d.data, valor: d.valor, tipo: 'Despesa' })),
  ];

  if (itens.length === 0) {
    toast('Nenhum item pendente para este cliente', 'error');
    return;
  }

  state.contadores.notaDebito = (state.contadores.notaDebito || 0) + 1;
  salvarStorage();
  const numero = String(state.contadores.notaDebito).padStart(4, '0');
  const total = itens.reduce((s, i) => s + i.valor, 0);

  const linhasItens = itens.map((item, i) => `
    <tr>
      <td style="text-align:center;color:#6b7280">${i + 1}</td>
      <td>${item.descricao}</td>
      <td style="text-align:center;white-space:nowrap">${fmtData(item.data)}</td>
      <td style="text-align:center"><span style="font-size:10px;background:#eef2ff;color:#4f46e5;padding:2px 8px;border-radius:4px;font-weight:700">${item.tipo}</span></td>
      <td style="text-align:right;font-weight:600">${fmt(item.valor)}</td>
    </tr>
  `).join('');

  document.getElementById('printDoc').innerHTML = `
    <div class="doc-paper">
      <div class="doc-header">
        <div class="doc-logo">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          <div>
            <div class="doc-office">Financeiro NG</div>
            <div class="doc-office-sub">Escritório de Advocacia</div>
          </div>
        </div>
        <div class="doc-title-block">
          <div class="doc-title">NOTA DE DÉBITO</div>
          <div class="doc-meta">Nº ${numero}</div>
          <div class="doc-meta">Data: ${fmtData(hoje())}</div>
        </div>
      </div>

      <div class="doc-section">
        <div class="doc-section-title">Cliente</div>
        <div class="doc-client-grid">
          <div><span class="doc-label">Nome / Razão Social: </span><strong>${cliente.nome}</strong></div>
          ${cliente.cpf_cnpj ? `<div><span class="doc-label">CPF / CNPJ: </span>${cliente.cpfCnpj}</div>` : ''}
          ${cliente.email ? `<div><span class="doc-label">Email: </span>${cliente.email}</div>` : ''}
          ${cliente.telefone ? `<div><span class="doc-label">Telefone: </span>${cliente.telefone}</div>` : ''}
          ${cliente.endereco ? `<div style="grid-column:1/-1"><span class="doc-label">Endereço: </span>${cliente.endereco}</div>` : ''}
        </div>
      </div>

      <div class="doc-section">
        <div class="doc-section-title">Discriminação dos Serviços e Despesas</div>
        <table class="doc-table">
          <thead>
            <tr>
              <th style="width:36px;text-align:center">Nº</th>
              <th>Descrição</th>
              <th style="width:100px;text-align:center">Data</th>
              <th style="width:90px;text-align:center">Tipo</th>
              <th style="width:110px;text-align:right">Valor</th>
            </tr>
          </thead>
          <tbody>${linhasItens}</tbody>
          <tfoot>
            <tr>
              <td colspan="4" style="text-align:right;font-weight:700;padding:10px 12px">TOTAL</td>
              <td style="text-align:right;font-weight:800;font-size:16px;padding:10px 12px">${fmt(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="doc-footer">
        <div class="doc-sign-block"><div class="doc-sign-line"></div><div class="doc-sign-label">Assinatura do Advogado</div></div>
        <div class="doc-sign-block"><div class="doc-sign-line"></div><div class="doc-sign-label">Assinatura do Cliente</div></div>
      </div>
      <div class="doc-obs">Emitido em ${fmtData(hoje())}. Este documento não tem valor fiscal.</div>
    </div>
  `;

  // Marcar despesas incluídas como faturadas
  despesas.forEach(d => {
    const idx = state.despesas.findIndex(x => x.id === d.id);
    if (idx !== -1) state.despesas[idx].status = 'faturado';
  });
  salvarStorage();

  document.getElementById('printOverlay').classList.add('open');
}

// ===== RECIBO DE PAGAMENTO =====
function gerarRecibo(cobrancaId) {
  const c = state.cobrancas.find(x => x.id === cobrancaId);
  if (!c || c.status !== 'pago') return;

  state.contadores.recibo = (state.contadores.recibo || 0) + 1;
  salvarStorage();
  const numero = String(state.contadores.recibo).padStart(4, '0');
  const cliente = c.clienteId ? state.clientes.find(x => x.id === c.clienteId) : null;
  const valorPago = c.valorPago || c.valor;

  document.getElementById('printDoc').innerHTML = `
    <div class="doc-paper">
      <div class="doc-header">
        <div class="doc-logo">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          <div>
            <div class="doc-office">Financeiro NG</div>
            <div class="doc-office-sub">Escritório de Advocacia</div>
          </div>
        </div>
        <div class="doc-title-block">
          <div class="doc-title">RECIBO DE PAGAMENTO</div>
          <div class="doc-meta">Nº ${numero}</div>
          <div class="doc-meta">Data: ${fmtData(c.dataPagamento || hoje())}</div>
        </div>
      </div>

      <div class="doc-recibo-valor">
        <div class="doc-recibo-valor-label">Valor Recebido</div>
        <div class="doc-recibo-valor-num">${fmt(valorPago)}</div>
      </div>

      ${cliente ? `
      <div class="doc-section">
        <div class="doc-section-title">Pagador</div>
        <div class="doc-client-grid">
          <div><span class="doc-label">Nome / Razão Social: </span><strong>${cliente.nome}</strong></div>
          ${cliente.cpf_cnpj ? `<div><span class="doc-label">CPF / CNPJ: </span>${cliente.cpfCnpj}</div>` : ''}
          ${cliente.email ? `<div><span class="doc-label">Email: </span>${cliente.email}</div>` : ''}
          ${cliente.telefone ? `<div><span class="doc-label">Telefone: </span>${cliente.telefone}</div>` : ''}
        </div>
      </div>` : ''}

      <div class="doc-section">
        <div class="doc-section-title">Referente a</div>
        <div class="doc-client-grid">
          <div><span class="doc-label">Descrição: </span><strong>${c.descricao}</strong></div>
          ${c.categoria ? `<div><span class="doc-label">Categoria: </span>${c.categoria}</div>` : ''}
          <div><span class="doc-label">Vencimento: </span>${fmtData(c.dataVencimento)}</div>
          <div><span class="doc-label">Data do pagamento: </span>${fmtData(c.dataPagamento)}</div>
          ${c.observacoes ? `<div style="grid-column:1/-1"><span class="doc-label">Obs: </span>${c.observacoes}</div>` : ''}
        </div>
      </div>

      <div class="doc-footer">
        <div class="doc-sign-block"><div class="doc-sign-line"></div><div class="doc-sign-label">Assinatura do Recebedor</div></div>
        <div class="doc-sign-block"><div class="doc-sign-line"></div><div class="doc-sign-label">Assinatura do Pagador</div></div>
      </div>
      <div class="doc-obs">Recibo emitido em ${fmtData(hoje())}. Este documento confirma o recebimento do valor acima discriminado.</div>
    </div>
  `;

  document.getElementById('printOverlay').classList.add('open');
}

function fecharPrintOverlay() {
  document.getElementById('printOverlay').classList.remove('open');
}

// ===== INIT =====
function init() {
  carregarStorage();
  configurarCamposMoeda();

  // Se não tem dados, carrega demo
  if (state.cobrancas.length === 0) carregarDemo();

  popularClientesForms();
  carregarClientesSupabase();

  // Event listeners do nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const view = item.dataset.view;
      if (view) navegarPara(view);
      // Fechar sidebar mobile
      if (window.innerWidth < 680) {
        document.getElementById('sidebar').classList.remove('open');
      }
    });
  });

  // Event listener recorrência modal
  document.getElementById('fRecorrencia').addEventListener('change', toggleRepetir);

  navegarPara('dashboard');
}

document.addEventListener('DOMContentLoaded', init);

async function testarSupabase() {
const { data, error } = await supabaseClient
.from('clientes')
.select('*');

console.log('Clientes:', data);
console.log('Erro:', error);
}

testarSupabase();

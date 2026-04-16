/* ===== Fluxo 360 — app.js ===== */

const supabaseUrl ="https://gcucadlnxttlxckravui.supabase.co"
const supabaseKey = "sb_publishable_5i0somnwIAvyLNImLSWYxg_yogC3bCb"

const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
console.log("Biblioteca Supabase:", supabase);
console.log("Cliente Supabase:", supabaseClient);

async function cadastrarUsuario() {
  const email = document.getElementById('cadastroEmail').value.trim();
  const senha = document.getElementById('cadastroSenha').value.trim();
  const nome = document.getElementById('cadastroNome')?.value.trim() || '';

  if (!email || !senha) { alert('Preencha email e senha.'); return; }
  if (senha.length < 6) { alert('A senha deve ter no mínimo 6 caracteres.'); return; }

  const { error } = await supabaseClient.auth.signUp({
    email,
    password: senha,
    options: { data: { nome } }
  });

  if (error) { alert(error.message); return; }
  alert('Conta criada com sucesso! Verifique seu email para confirmar antes de fazer login.');
}

async function esqueciSenha() {
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) {
    alert('Digite seu email no campo acima para receber o link de redefinição de senha.');
    document.getElementById('loginEmail').focus();
    return;
  }
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin
  });
  if (error) { alert('Erro: ' + error.message); return; }
  alert('Email de redefinição de senha enviado! Verifique sua caixa de entrada (e o spam).');
}

async function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const senha = document.getElementById('loginSenha').value.trim();

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: senha });
  if (error) { alert(error.message); return; }

  document.getElementById('loginScreen').style.display = 'none';
  await inicializarContextoEmpresa(data.user);
}

async function verificarSessao() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    document.getElementById('loginScreen').style.display = 'none';
    await inicializarContextoEmpresa(data.session.user);
  } else {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
  }
}

verificarSessao();

async function logout() {
  await supabaseClient.auth.signOut();
  state.empresaId = null;
  state.empresaNome = null;
  state.meuPerfil = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('setupEmpresaScreen').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
}

// Após login: verifica se usuário já pertence a uma empresa
async function inicializarContextoEmpresa(user) {
  const { data: membro, error } = await supabaseClient
    .from('usuarios_empresa')
    .select('perfil, nome, empresa_id, empresas(id, nome)')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) console.error('Erro ao buscar empresa:', error);

  if (!membro) {
    // Usuário ainda não tem empresa — mostrar tela de setup
    document.getElementById('setupEmpresaScreen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    return;
  }

  state.empresaId = membro.empresa_id;
  state.empresaNome = membro.empresas?.nome || '';
  state.meuPerfil = {
    userId: user.id,
    email: user.email,
    nome: membro.nome || user.email,
    perfil: membro.perfil,
    cargo: membro.cargo || '',
  };

  document.getElementById('setupEmpresaScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  renderSidebarUser();
  await carregarDadosSupabase();
  atualizarStatusAuto();
  atualizarStatusAutoCP();
  popularClientesForms();
  await carregarNotificacoes();
  navegarPara(isColaborador() ? 'cobrancas' : isFinanceiro() ? 'notasfiscais' : 'dashboard');
}

// ===== STATE =====
let state = {
  // Contexto multi-empresa
  empresaId: null,
  empresaNome: null,
  meuPerfil: null, // { userId, email, nome, role }

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
  categoriasDespesas: [
    { nome: 'Custas Processuais', cor: '#3b82f6' },
    { nome: 'Diligências',        cor: '#06b6d4' },
    { nome: 'Honorários',         cor: '#6366f1' },
    { nome: 'Impostos',           cor: '#ef4444' },
    { nome: 'Outros',             cor: '#6b7280' },
  ],
  categoriasCP: [
    { nome: 'Prestadores de Serviço', cor: '#8b5cf6' },
    { nome: 'Tributos / Impostos',    cor: '#ef4444' },
    { nome: 'Notas Fiscais',          cor: '#3b82f6' },
    { nome: 'Folha de Pagamento',     cor: '#f59e0b' },
    { nome: 'Aluguel / Locações',     cor: '#6366f1' },
    { nome: 'Outros',                 cor: '#6b7280' },
  ],
  clientes: [],
  despesas: [],
  contasPagar: [],
  notasFiscais: [],
  contadores: { notaDebito: 0, recibo: 0 },
  config: { diasAlerta: 7 },
  notificacoes: [],
};

let viewAtual = 'dashboard';
let baixaIdAtual = null;
let editarMembroAtivo = null;
let baixaColecao = 'cobrancas'; // 'cobrancas' | 'contaspagar'
let selecionadosCobrancas = new Set();
let selecionadosCP = new Set();
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

function fmtDataHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ===== PERFIS E PERMISSÕES =====
const PERFIS = {
  admin:       { label: 'Administrador', cor: 'badge-pago' },
  adm:         { label: 'Administrador', cor: 'badge-pago' },
  operador:    { label: 'Operador',      cor: 'badge-pendente' },
  colaborador: { label: 'Colaborador',   cor: 'badge-parcial' },
  controler:   { label: 'Controler',     cor: 'badge-vencido' },
  financeiro:  { label: 'Financeiro',    cor: 'badge-financeiro' },
};

function perfilAtual() { return state.meuPerfil?.perfil || ''; }
function isAdm()         { const p = perfilAtual(); return p === 'admin' || p === 'adm'; }
function isColaborador() { return perfilAtual() === 'colaborador'; }
function isControler()   { return perfilAtual() === 'controler'; }
function isFinanceiro()  { return perfilAtual() === 'financeiro'; }

function podeAcessarView(view) {
  if (isAdm()) return true;
  // apenas admin/financeiro/controler acessam notas fiscais
  if (view === 'notasfiscais') return isFinanceiro() || isControler();
  // colaborador e operador e controler não acessam áreas administrativas
  if (['usuarios', 'configuracoes'].includes(view)) return false;
  // colaborador não acessa dashboard nem relatórios
  if (isColaborador() && ['dashboard', 'relatorios'].includes(view)) return false;
  // financeiro só acessa notas fiscais (já tratado acima)
  if (isFinanceiro()) return view === 'notasfiscais';
  return true;
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

// ===== PERSISTÊNCIA SUPABASE =====

// --- Mappers: Cobranças ---
function cobrancaParaDb(c) {
  return {
    id: c.id,
    empresa_id: state.empresaId,
    user_id: state.meuPerfil?.userId,
    cliente_id: c.clienteId || null, cliente_nome: c.clienteNome || null,
    descricao: c.descricao, valor: c.valor,
    data_vencimento: c.dataVencimento, categoria: c.categoria || null,
    recorrencia: c.recorrencia || 'nenhuma', observacoes: c.observacoes || null,
    status: c.status, data_pagamento: c.dataPagamento || null,
    valor_pago: c.valorPago != null ? c.valorPago : null,
    criado_em: c.criadoEm || new Date().toISOString(),
    grupo_id: c.grupoId || null,
    parcela_num: c.parcelaNum || null,
    parcela_total: c.parcelaTotal || null,
  };
}
function dbParaCobranca(row) {
  return {
    id: row.id, clienteId: row.cliente_id, clienteNome: row.cliente_nome,
    descricao: row.descricao, valor: Number(row.valor),
    dataVencimento: row.data_vencimento, categoria: row.categoria,
    recorrencia: row.recorrencia, observacoes: row.observacoes, status: row.status,
    dataPagamento: row.data_pagamento,
    valorPago: row.valor_pago != null ? Number(row.valor_pago) : null,
    criadoEm: row.criado_em,
    grupoId: row.grupo_id || null,
    parcelaNum: row.parcela_num || null,
    parcelaTotal: row.parcela_total || null,
  };
}

// --- Mappers: Despesas ---
function despesaParaDb(d) {
  return {
    id: d.id,
    empresa_id: state.empresaId,
    user_id: state.meuPerfil?.userId,
    cliente_id: d.clienteId || null,
    cliente_nome: d.clienteNome || null,
    descricao: d.descricao, data: d.data, valor: d.valor,
    categoria: d.categoria || null,
    observacoes: d.observacoes || null, status: d.status,
    criado_em: d.criadoEm || new Date().toISOString(),
  };
}
function dbParaDespesa(row) {
  return {
    id: row.id, clienteId: row.cliente_id, clienteNome: row.cliente_nome || null,
    descricao: row.descricao, categoria: row.categoria || null,
    data: row.data, valor: Number(row.valor), observacoes: row.observacoes,
    status: row.status, criadoEm: row.criado_em,
  };
}

// --- Mappers: Contas a Pagar ---
function contaPagarParaDb(cp) {
  return {
    id: cp.id,
    empresa_id: state.empresaId,
    user_id: state.meuPerfil?.userId,
    descricao: cp.descricao, tipo: cp.tipo || null,
    data_vencimento: cp.dataVencimento, valor: cp.valor,
    recorrencia: cp.recorrencia || 'nenhuma', observacoes: cp.observacoes || null,
    status: cp.status, data_pagamento: cp.dataPagamento || null,
    valor_pago: cp.valorPago != null ? cp.valorPago : null,
    criado_em: cp.criadoEm || new Date().toISOString(),
    grupo_id: cp.grupoId || null,
    parcela_num: cp.parcelaNum || null,
    parcela_total: cp.parcelaTotal || null,
  };
}
function dbParaContaPagar(row) {
  return {
    id: row.id, descricao: row.descricao, tipo: row.tipo,
    dataVencimento: row.data_vencimento, valor: Number(row.valor),
    recorrencia: row.recorrencia, observacoes: row.observacoes, status: row.status,
    dataPagamento: row.data_pagamento,
    valorPago: row.valor_pago != null ? Number(row.valor_pago) : null,
    criadoEm: row.criado_em,
    grupoId: row.grupo_id || null,
    parcelaNum: row.parcela_num || null,
    parcelaTotal: row.parcela_total || null,
  };
}

// --- Mappers: Notas Fiscais ---
function notaFiscalParaDb(nf) {
  return {
    id: nf.id,
    empresa_id: state.empresaId,
    user_id: state.meuPerfil?.userId,
    cliente_id: nf.clienteId || null,
    cliente_nome: nf.clienteNome || null,
    data_nota: nf.dataNota,
    valor: nf.valor,
    descricao: nf.descricao || null,
    arquivo_url: nf.arquivoUrl || null,
    observacoes: nf.observacoes || null,
    criado_em: nf.criadoEm || new Date().toISOString(),
  };
}
function dbParaNotaFiscal(row) {
  return {
    id: row.id,
    clienteId: row.cliente_id || null,
    clienteNome: row.cliente_nome || null,
    dataNota: row.data_nota,
    valor: Number(row.valor),
    descricao: row.descricao || null,
    arquivoUrl: row.arquivo_url || null,
    observacoes: row.observacoes || null,
    criadoEm: row.criado_em,
  };
}

// Carrega todos os dados da empresa do Supabase
async function carregarDadosSupabase() {
  if (!state.empresaId) return;

  const [resCobrancas, resDespesas, resCP, resClientes, resConfig, resNF] = await Promise.all([
    supabaseClient.from('cobrancas').select('*').eq('empresa_id', state.empresaId).order('data_vencimento', { ascending: true }),
    supabaseClient.from('despesas').select('*').eq('empresa_id', state.empresaId).order('data', { ascending: false }),
    supabaseClient.from('contas_pagar').select('*').eq('empresa_id', state.empresaId).order('data_vencimento', { ascending: true }),
    supabaseClient.from('clientes').select('*').eq('empresa_id', state.empresaId).order('created_at', { ascending: false }),
    supabaseClient.from('user_config').select('*').eq('empresa_id', state.empresaId).maybeSingle(),
    supabaseClient.from('notas_fiscais').select('*').eq('empresa_id', state.empresaId).order('data_nota', { ascending: false }),
  ]);

  if (resCobrancas.error) console.error('Erro ao carregar cobranças:', resCobrancas.error);
  else state.cobrancas = (resCobrancas.data || []).map(dbParaCobranca);

  if (resDespesas.error) console.error('Erro ao carregar despesas:', resDespesas.error);
  else state.despesas = (resDespesas.data || []).map(dbParaDespesa);

  if (resCP.error) console.error('Erro ao carregar contas a pagar:', resCP.error);
  else state.contasPagar = (resCP.data || []).map(dbParaContaPagar);

  if (resClientes.error) console.error('Erro ao carregar clientes:', resClientes.error);
  else state.clientes = resClientes.data || [];

  if (resNF.error) console.error('Erro ao carregar notas fiscais:', resNF.error);
  else state.notasFiscais = (resNF.data || []).map(dbParaNotaFiscal);

  if (resConfig.data) {
    state.categorias = resConfig.data.categorias || state.categorias;
    state.categoriasDespesas = resConfig.data.categorias_despesas || state.categoriasDespesas;
    state.categoriasCP = resConfig.data.categorias_cp || state.categoriasCP;
    state.config = { ...state.config, ...(resConfig.data.config || {}) };
    state.contadores = { ...state.contadores, ...(resConfig.data.contadores || {}) };
  }
}

// Salva categorias, config e contadores no Supabase
async function salvarConfigSupabase() {
  if (!state.empresaId) return;
  const { error } = await supabaseClient.from('user_config').upsert([{
    empresa_id: state.empresaId,
    user_id: state.meuPerfil?.userId,
    categorias: state.categorias,
    categorias_despesas: state.categoriasDespesas,
    categorias_cp: state.categoriasCP,
    config: state.config,
    contadores: state.contadores,
  }]);
  if (error) console.error('Erro ao salvar configurações:', error);
}

// ===== EMPRESA / MULTI-TENANT =====

function setupAba(aba) {
  document.getElementById('setupCriar').style.display = aba === 'criar' ? '' : 'none';
  document.getElementById('setupEntrar').style.display = aba === 'entrar' ? '' : 'none';
  document.querySelectorAll('.setup-tab').forEach((t, i) => {
    t.classList.toggle('active', (i === 0 && aba === 'criar') || (i === 1 && aba === 'entrar'));
  });
}

async function criarEmpresa() {
  const nome = document.getElementById('setupNomeEmpresa').value.trim();
  const nomeUsuario = document.getElementById('setupNomeUsuarioCriar').value.trim();
  const cargo = document.getElementById('setupCargoCriar').value.trim();
  if (!nome || !nomeUsuario) { alert('Preencha nome da empresa e seu nome.'); return; }

  const { data: sessao } = await supabaseClient.auth.getSession();
  const user = sessao.session.user;

  const { data: empresa, error: eEmpresa } = await supabaseClient
    .from('empresas')
    .insert([{ nome, criado_por: user.id }])
    .select()
    .single();
  if (eEmpresa) { alert('Erro ao criar empresa: ' + eEmpresa.message); return; }

  const { error: eMembro } = await supabaseClient
    .from('usuarios_empresa')
    .insert([{ empresa_id: empresa.id, user_id: user.id, nome: nomeUsuario, perfil: 'admin', cargo }]);
  if (eMembro) { alert('Erro ao criar usuário: ' + eMembro.message); return; }

  state.empresaId = empresa.id;
  state.empresaNome = empresa.nome;
  state.meuPerfil = { userId: user.id, email: user.email, nome: nomeUsuario, perfil: 'admin', cargo };

  document.getElementById('setupEmpresaScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  renderSidebarUser();
  await carregarDadosSupabase();
  atualizarStatusAuto();
  atualizarStatusAutoCP();
  popularClientesForms();
  await carregarNotificacoes();
  navegarPara(isFinanceiro() ? 'notasfiscais' : 'dashboard');
}

async function entrarComCodigo() {
  const codigo = document.getElementById('setupCodigo').value.trim().toUpperCase();
  const nomeUsuario = document.getElementById('setupNomeUsuarioEntrar').value.trim();
  const cargo = document.getElementById('setupCargoEntrar').value.trim();
  if (!codigo || !nomeUsuario) { alert('Preencha todos os campos.'); return; }

  const { data: sessao } = await supabaseClient.auth.getSession();
  const user = sessao.session.user;

  const { data: convite, error: eConvite } = await supabaseClient
    .from('convites_empresa')
    .select('*')
    .eq('codigo', codigo)
    .is('usado_por', null)
    .maybeSingle();

  if (eConvite || !convite) { alert('Código inválido ou já utilizado.'); return; }

  const { error: eMembro } = await supabaseClient
    .from('usuarios_empresa')
    .insert([{ empresa_id: convite.empresa_id, user_id: user.id, nome: nomeUsuario, perfil: 'operador', cargo }]);
  if (eMembro) { alert('Erro ao entrar na empresa: ' + eMembro.message); return; }

  await supabaseClient
    .from('convites_empresa')
    .update({ usado_por: user.id, usado_em: new Date().toISOString() })
    .eq('id', convite.id);

  const { data: empresa } = await supabaseClient
    .from('empresas').select('nome').eq('id', convite.empresa_id).single();

  state.empresaId = convite.empresa_id;
  state.empresaNome = empresa?.nome || '';
  state.meuPerfil = { userId: user.id, email: user.email, nome: nomeUsuario, perfil: 'operador', cargo };

  document.getElementById('setupEmpresaScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  renderSidebarUser();
  await carregarDadosSupabase();
  atualizarStatusAuto();
  atualizarStatusAutoCP();
  popularClientesForms();
  await carregarNotificacoes();
  navegarPara(isColaborador() ? 'cobrancas' : isFinanceiro() ? 'notasfiscais' : 'dashboard');
}

function renderSidebarUser() {
  if (!state.meuPerfil) return;
  const { nome, perfil, cargo } = state.meuPerfil;
  const iniciais = nome.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const el = document.getElementById('sidebarUser');
  if (!el) return;
  el.style.display = 'flex';
  document.getElementById('userAvatar').textContent = iniciais;
  document.getElementById('userNome').textContent = nome;
  const cargoEl = document.getElementById('userCargo');
  if (cargoEl) { cargoEl.textContent = cargo || ''; cargoEl.style.display = cargo ? '' : 'none'; }
  const info = PERFIS[perfil] || { label: perfil, cor: 'badge-pendente' };
  const roleEl = document.getElementById('userRole');
  if (roleEl) { roleEl.textContent = info.label; roleEl.className = `user-role ${info.cor}`; }

  // Empresa name in sidebar header
  const empresaEl = document.getElementById('sidebarEmpresaName');
  if (empresaEl) empresaEl.textContent = state.empresaNome || '';

  // Ocultar itens de nav sem permissão
  document.querySelectorAll('.nav-item[data-view]').forEach(a => {
    a.style.display = podeAcessarView(a.dataset.view) ? '' : 'none';
  });
}

async function gerarConvite() {
  if (!isAdm()) {
    toast('Apenas administradores podem gerar convites.', 'error');
    return;
  }
  const { data: sessao } = await supabaseClient.auth.getSession();
  const { data: convite, error } = await supabaseClient
    .from('convites_empresa')
    .insert([{ empresa_id: state.empresaId, criado_por: sessao.session.user.id }])
    .select()
    .single();
  if (error) { toast('Erro ao gerar convite.', 'error'); return; }

  const box = document.getElementById('conviteGerado');
  box.style.display = 'flex';
  box.innerHTML = `
    <div style="flex:1">
      <div class="invite-code">${convite.codigo}</div>
      <div class="invite-instructions">Compartilhe este código. Ele só pode ser usado uma vez.</div>
    </div>
    <button class="btn btn-outline" onclick="navigator.clipboard.writeText('${convite.codigo}').then(() => toast('Código copiado!', 'success'))">Copiar</button>
  `;
}

async function renderEquipe() {
  const el = document.getElementById('listaEquipe');
  if (!el || !state.empresaId) return;

  const { data: membros, error } = await supabaseClient
    .from('usuarios_empresa')
    .select('*')
    .eq('empresa_id', state.empresaId)
    .order('criado_em', { ascending: true });

  if (error || !membros?.length) {
    el.innerHTML = '<div class="empty-state" style="padding:20px 0"><p>Nenhum membro.</p></div>';
    return;
  }

  el.innerHTML = membros.map(m => {
    const ini = m.nome.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const isMe = m.user_id === state.meuPerfil?.userId;
    return `
      <div class="team-member-item">
        <div class="team-avatar">${ini}</div>
        <div class="team-info">
          <div class="team-nome">${m.nome}${isMe ? ' <span style="font-size:11px;color:var(--text-muted)">(você)</span>' : ''}</div>
          <div class="team-desde">Desde ${fmtData(m.criado_em?.slice(0, 10))}</div>
        </div>
        <span class="badge ${(PERFIS[m.perfil] || PERFIS.operador).cor}">${(PERFIS[m.perfil] || { label: m.perfil }).label}</span>
      </div>`;
  }).join('');

  const btn = document.getElementById('btnGerarConvite');
  if (btn) btn.style.display = isAdm() ? '' : 'none';
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
  if (!podeAcessarView(view)) {
    toast('Sem permissão para acessar esta área.', 'error');
    return;
  }
  viewAtual = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById('view-' + view)?.classList.add('active');
  document.querySelector(`[data-view="${view}"]`)?.classList.add('active');

  const titulos = { dashboard: 'Dashboard', cobrancas: 'Cobranças', relatorios: 'Relatórios', configuracoes: 'Configurações', clientes: 'Clientes', despesas: 'Despesas Reembolsáveis', contaspagar: 'Contas a Pagar', usuarios: 'Usuários', notasfiscais: 'Notas Fiscais' };
  document.getElementById('pageTitle').textContent = titulos[view] || '';
  atualizarAcaoTopo(view);

  if (view === 'dashboard') renderDashboard();
  else if (view === 'cobrancas') { renderCobrancas(); popularFiltros(); }
  else if (view === 'relatorios') renderRelatorios();
  else if (view === 'configuracoes') renderConfiguracoes();
  else if (view === 'clientes') renderClientes();
  else if (view === 'despesas') renderDespesas();
  else if (view === 'contaspagar') renderContasPagar();
  else if (view === 'usuarios') renderUsuarios();
  else if (view === 'notasfiscais') renderNotasFiscais();
}

function atualizarAcaoTopo(view) {
  const actions = document.getElementById('topbarActions');
  if (!actions) return;

  const botoesPorView = {
    dashboard: [
      { label: 'Novo Cliente', action: "abrirModalCliente()" },
      { label: 'Nova Cobrança', action: "abrirModalCobranca()" },
      { label: 'Nova Despesa Reembolsável', action: "abrirModalDespesa()" },
      { label: 'Nova Conta a Pagar', action: "abrirModalContaPagar()" },
      { label: 'Emitir Relatórios', action: "navegarPara('relatorios')" },
    ],
    cobrancas: [
      { label: 'Nova Cobrança', action: "abrirModalCobranca()" },
    ],
    contaspagar: [
      { label: 'Nova Conta a Pagar', action: "abrirModalContaPagar()" },
    ],
    despesas: [
      { label: 'Nova Despesa Reembolsável', action: "abrirModalDespesa()" },
    ],
    relatorios: [
      { label: 'Imprimir Relatório', action: "imprimirRelatorio()" },
    ],
    clientes: [
      { label: 'Novo Cliente', action: "abrirModalCliente()" },
    ],
    notasfiscais: [
      { label: 'Nova Nota Fiscal', action: "abrirModalNotaFiscal()" },
    ],
    usuarios: [],
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

  const brutoMes = state.cobrancas.filter(c => {
    if (!c.dataVencimento) return false;
    const [y, m] = c.dataVencimento.split('-');
    return parseInt(m) === mesAtual && parseInt(y) === anoAtual;
  });
  const totalBrutoMes = brutoMes.reduce((s, c) => s + c.valor, 0);
  document.getElementById('totalBrutoMes').textContent = fmt(totalBrutoMes);
  document.getElementById('qtdBrutoMes').textContent = `${brutoMes.length} cobrança${brutoMes.length !== 1 ? 's' : ''}`;

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
  const cpVencidas = state.contasPagar.filter(cp => cp.status === 'vencido');
  const cpProximas = state.contasPagar.filter(cp => {
    const d = diasAte(cp.dataVencimento);
    return cp.status === 'pendente' && d >= 0 && d <= dias;
  });

  const alertasEl = document.getElementById('alertas-container');
  let alertasHtml = '';

  if (vencidas.length > 0) {
    const tooltipVencidas = vencidas
      .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento))
      .map(c => `${fmtData(c.dataVencimento)}  ${(c.clienteNome || nomeClienteTexto(c.clienteId) || 'Sem cliente').slice(0,28)}  ${fmt(c.valor)}`)
      .join('&#10;');
    alertasHtml += `<div class="alerta alerta-danger alerta-tooltip" data-tooltip="${tooltipVencidas}" style="cursor:default">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span><strong>${vencidas.length} cobrança${vencidas.length !== 1 ? 's' : ''} vencida${vencidas.length !== 1 ? 's' : ''}!</strong> Total: ${fmt(vencidas.reduce((s,c) => s+c.valor, 0))} <span style="font-size:11px;opacity:.7">— passe o mouse para ver</span></span>
    </div>`;
  }
  if (cpVencidas.length > 0) {
    const tooltipCP = cpVencidas
      .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento))
      .map(cp => `${fmtData(cp.dataVencimento)}  ${(cp.descricao || 'Sem descrição').slice(0,28)}  ${fmt(cp.valor)}`)
      .join('&#10;');
    alertasHtml += `<div class="alerta alerta-danger alerta-tooltip" data-tooltip="${tooltipCP}" style="cursor:default">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span><strong>${cpVencidas.length} conta${cpVencidas.length !== 1 ? 's' : ''} a pagar vencida${cpVencidas.length !== 1 ? 's' : ''}!</strong> Total: ${fmt(cpVencidas.reduce((s,cp) => s+cp.valor, 0))} <span style="font-size:11px;opacity:.7">— passe o mouse para ver</span></span>
    </div>`;
  }
  if (proximas.length > 0) {
    const tooltipProximas = proximas
      .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento))
      .map(c => `${fmtData(c.dataVencimento)}  ${(c.clienteNome || nomeClienteTexto(c.clienteId) || 'Sem cliente').slice(0,28)}  ${fmt(c.valor)}`)
      .join('&#10;');
    alertasHtml += `<div class="alerta alerta-warning alerta-tooltip" data-tooltip="${tooltipProximas}" style="cursor:default">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <span><strong>${proximas.length} cobrança${proximas.length !== 1 ? 's' : ''}</strong> vence${proximas.length !== 1 ? 'm' : ''} nos próximos ${dias} dias <span style="font-size:11px;opacity:.7">— passe o mouse para ver</span></span>
    </div>`;
  }
  if (cpProximas.length > 0) {
    const tooltipCPProx = cpProximas
      .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento))
      .map(cp => `${fmtData(cp.dataVencimento)}  ${(cp.descricao || 'Sem descrição').slice(0,28)}  ${fmt(cp.valor)}`)
      .join('&#10;');
    alertasHtml += `<div class="alerta alerta-warning alerta-tooltip" data-tooltip="${tooltipCPProx}" style="cursor:default">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <span><strong>${cpProximas.length} conta${cpProximas.length !== 1 ? 's' : ''} a pagar</strong> vence${cpProximas.length !== 1 ? 'm' : ''} nos próximos ${dias} dias <span style="font-size:11px;opacity:.7">— passe o mouse para ver</span></span>
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
      <tr class="${selecionadosCobrancas.has(c.id) ? 'row-selected' : ''}">
        <td style="padding:0 8px"><input type="checkbox" data-id="${c.id}" ${selecionadosCobrancas.has(c.id) ? 'checked' : ''} onchange="toggleSelecionadoCobranca('${c.id}')"></td>
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
        <td>${c.recorrencia !== 'nenhuma' ? `<span class="rec-badge">${c.recorrencia}${c.parcelaNum ? `<span class="parcela-tag">${c.parcelaNum}/${c.parcelaTotal}</span>` : ''}</span>` : '<span style="color:var(--text-light)">—</span>'}</td>
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

    // Atualizar estado do checkbox "selecionar todos"
    const checkAll = document.getElementById('checkTodosCobrancas');
    if (checkAll) {
      const checkboxes = document.querySelectorAll('#tabelaBody input[type=checkbox]');
      checkAll.checked = checkboxes.length > 0 && [...checkboxes].every(cb => cb.checked);
      checkAll.indeterminate = !checkAll.checked && [...checkboxes].some(cb => cb.checked);
    }
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
  if (rec === 'nenhuma') {
    grupoRepetir.style.display = 'none';
    document.getElementById('grupoRemover').style.display = 'none';
    return;
  }
  grupoRepetir.style.display = 'flex';
  if (editId) {
    document.getElementById('labelRepeticoes').textContent = 'Adicionar mais ocorrências';
    document.getElementById('spanRepeticoesHint').textContent = 'a partir da última data (0 = nenhuma)';
    document.getElementById('fRepeticoes').value = 0;
    document.getElementById('fRepeticoes').min = 0;
    document.getElementById('grupoRemover').style.display = 'flex';
    document.getElementById('fRemover').value = 0;
  } else {
    document.getElementById('labelRepeticoes').textContent = 'Repetir por';
    document.getElementById('spanRepeticoesHint').textContent = 'ocorrências';
    document.getElementById('fRepeticoes').min = 1;
    document.getElementById('grupoRemover').style.display = 'none';
    if (!document.getElementById('fRepeticoes').value || document.getElementById('fRepeticoes').value === '0') {
      document.getElementById('fRepeticoes').value = 12;
    }
  }
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
  const clienteNome = (clienteId ? clienteExistente.nome : clienteInformado).toUpperCase();
  const descricao = document.getElementById('fDescricao').value.trim();
  const valor = parseMoedaBR(document.getElementById('fValor').value);
  const dataVencimento = document.getElementById('fVencimento').value;
  const categoria = document.getElementById('fCategoria').value;
  const recorrencia = document.getElementById('fRecorrencia').value;
  const repeticoes = parseInt(document.getElementById('fRepeticoes').value) || 0;
  const remover = parseInt(document.getElementById('fRemover').value) || 0;
  const observacoes = document.getElementById('fObservacoes').value.trim();

  if (id) {
    // Editar
    const idx = state.cobrancas.findIndex(c => c.id === id);
    if (idx !== -1) {
      const original = state.cobrancas[idx];
      state.cobrancas[idx] = { ...original, clienteId, clienteNome, descricao, valor, dataVencimento, categoria, recorrencia, observacoes };
      atualizarStatusAuto();
      supabaseClient.from('cobrancas').update(cobrancaParaDb(state.cobrancas[idx])).eq('id', id).then(({ error }) => {
        if (error) console.error('Erro ao atualizar cobrança:', error);
      });

      // Perguntar se quer atualizar demais lançamentos da série
      const grupoId = original.grupoId;
      const temSiblings = grupoId && state.cobrancas.some(c => c.grupoId === grupoId && c.id !== id);
      if (original.recorrencia && original.recorrencia !== 'nenhuma' && temSiblings) {
        if (confirm('Este lançamento faz parte de uma série recorrente.\nDeseja atualizar os demais lançamentos da série também?\n\n(Datas de vencimento e status de pagamento não serão alterados)')) {
          state.cobrancas.forEach((c, i) => {
            if (c.grupoId === grupoId && c.id !== id) {
              state.cobrancas[i] = { ...c, clienteId, clienteNome, descricao, valor, categoria, recorrencia, observacoes };
              supabaseClient.from('cobrancas').update(cobrancaParaDb(state.cobrancas[i])).eq('id', c.id).then(({ error }) => {
                if (error) console.error('Erro ao atualizar cobrança recorrente:', error);
              });
            }
          });
          atualizarStatusAuto();
        }
      }

      // Adicionar novas ocorrências se solicitado
      if (recorrencia !== 'nenhuma' && repeticoes > 0) {
        const serieGrupoId = grupoId || id;
        const serie = state.cobrancas.filter(c => c.grupoId === serieGrupoId || c.id === serieGrupoId);
        const ultimaData = serie.reduce((max, c) => c.dataVencimento > max ? c.dataVencimento : max, dataVencimento);
        const diaOriginal = new Date(dataVencimento + 'T00:00:00').getDate();
        let base = proximaData(new Date(ultimaData + 'T00:00:00'), recorrencia, diaOriginal);
        const maxParcelaAtual = serie.reduce((max, c) => Math.max(max, c.parcelaNum || 0), 0);
        const novoTotal = maxParcelaAtual + repeticoes;
        const novas = [];
        for (let i = 0; i < repeticoes; i++) {
          const dStr = base.toISOString().slice(0, 10);
          const nova = {
            id: uid(), clienteId, clienteNome, descricao, valor, dataVencimento: dStr,
            categoria, recorrencia, observacoes, status: 'pendente',
            dataPagamento: null, valorPago: null,
            criadoEm: new Date().toISOString(), grupoId: serieGrupoId,
            parcelaNum: maxParcelaAtual + i + 1, parcelaTotal: novoTotal,
          };
          nova.status = calcularStatus(nova);
          state.cobrancas.push(nova);
          novas.push(nova);
          base = proximaData(base, recorrencia, diaOriginal);
        }
        // Atualizar parcelaTotal em toda a série existente
        state.cobrancas.forEach((c, i) => {
          if ((c.grupoId === serieGrupoId || c.id === serieGrupoId) && !novas.includes(c)) {
            state.cobrancas[i] = { ...c, parcelaTotal: novoTotal };
          }
        });
        supabaseClient.from('cobrancas').insert(novas.map(c => cobrancaParaDb(c))).then(({ error }) => {
          if (error) console.error('Erro ao inserir novas ocorrências:', error);
        });
        supabaseClient.from('cobrancas').update({ parcela_total: novoTotal })
          .eq('grupo_id', serieGrupoId).then(({ error }) => {
            if (error) console.error('Erro ao atualizar parcela_total:', error);
          });
        toast(`Cobrança atualizada + ${repeticoes} ocorrência${repeticoes !== 1 ? 's' : ''} adicionada${repeticoes !== 1 ? 's' : ''}!`, 'success');
        fecharModalForce();
        if (viewAtual === 'dashboard') renderDashboard();
        else if (viewAtual === 'cobrancas') renderCobrancas();
        return;
      }

      // Remover ocorrências futuras não pagas se solicitado
      if (recorrencia !== 'nenhuma' && remover > 0) {
        const serieGrupoId = grupoId || id;
        const futuras = state.cobrancas
          .filter(c => (c.grupoId === serieGrupoId || c.id === serieGrupoId) && c.id !== id && c.status !== 'pago')
          .sort((a, b) => b.dataVencimento.localeCompare(a.dataVencimento)); // mais futuras primeiro
        const aRemover = futuras.slice(0, remover);
        if (aRemover.length > 0) {
          const idsRemover = aRemover.map(c => c.id);
          state.cobrancas = state.cobrancas.filter(c => !idsRemover.includes(c.id));
          supabaseClient.from('cobrancas').delete().in('id', idsRemover).then(({ error }) => {
            if (error) console.error('Erro ao remover ocorrências:', error);
          });
          toast(`Cobrança atualizada — ${aRemover.length} ocorrência${aRemover.length !== 1 ? 's' : ''} removida${aRemover.length !== 1 ? 's' : ''}!`, 'success');
          fecharModalForce();
          if (viewAtual === 'dashboard') renderDashboard();
          else if (viewAtual === 'cobrancas') renderCobrancas();
          return;
        }
      }
    }
    toast('Cobrança atualizada!', 'success');
  } else {
    // Criar (com recorrência)
    const qtd = recorrencia !== 'nenhuma' ? repeticoes : 1;
    let base = new Date(dataVencimento + 'T00:00:00');
    const diaOriginal = base.getDate(); // preserva o dia escolhido (ex: 30) para todos os meses
    const novasCobrancas = [];
    const grupoId = recorrencia !== 'nenhuma' ? uid() : null;

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
        grupoId,
        parcelaNum:   recorrencia !== 'nenhuma' ? i + 1   : null,
        parcelaTotal: recorrencia !== 'nenhuma' ? qtd      : null,
      };
      novaC.status = calcularStatus(novaC);
      state.cobrancas.push(novaC);
      novasCobrancas.push(novaC);

      // Avançar data preservando o dia original
      base = proximaData(base, recorrencia, diaOriginal);
    }
    supabaseClient.from('cobrancas').insert(novasCobrancas.map(c => cobrancaParaDb(c))).then(({ error }) => {
      if (error) console.error('Erro ao inserir cobranças:', error);
    });
    notificarControlersNovaCobranca(novasCobrancas[0]);
    toast(`${qtd} cobrança${qtd !== 1 ? 's' : ''} criada${qtd !== 1 ? 's' : ''}!`, 'success');
  }

  fecharModalForce();
  if (viewAtual === 'dashboard') renderDashboard();
  else if (viewAtual === 'cobrancas') renderCobrancas();
}

// diaOriginal: dia pretendido pelo usuário (ex: 30) — passado em todas as iterações
// para que meses curtos (fev) não "contaminem" os meses seguintes
function proximaData(base, rec, diaOriginal) {
  const d = new Date(base);
  const dia = diaOriginal || d.getDate();

  function avancaMeses(n) {
    d.setDate(1); // evita overflow ao mudar o mês
    d.setMonth(d.getMonth() + n);
    const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(dia, ultimoDia));
  }

  switch (rec) {
    case 'semanal':    d.setDate(d.getDate() + 7); break;
    case 'quinzenal':  d.setDate(d.getDate() + 15); break;
    case 'mensal':     avancaMeses(1);  break;
    case 'bimestral':  avancaMeses(2);  break;
    case 'trimestral': avancaMeses(3);  break;
    case 'semestral':  avancaMeses(6);  break;
    case 'anual':      avancaMeses(12); break;
  }
  return d;
}

function excluirCobranca(id) {
  const c = state.cobrancas.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`Excluir "${c.descricao}"?`)) return;
  state.cobrancas = state.cobrancas.filter(x => x.id !== id);
  supabaseClient.from('cobrancas').delete().eq('id', id).then(({ error }) => {
    if (error) console.error('Erro ao excluir cobrança:', error);
  });
  renderCobrancas();
  toast('Cobrança excluída');
}

// ===== SELEÇÃO EM MASSA =====
function toggleSelecionadoCobranca(id) {
  if (selecionadosCobrancas.has(id)) selecionadosCobrancas.delete(id);
  else selecionadosCobrancas.add(id);
  atualizarBulkBar('cobrancas');
  // Atualizar indeterminate do "selecionar todos"
  const checkAll = document.getElementById('checkTodosCobrancas');
  if (checkAll) {
    const checkboxes = document.querySelectorAll('#tabelaBody input[type=checkbox]');
    checkAll.checked = checkboxes.length > 0 && [...checkboxes].every(cb => cb.checked);
    checkAll.indeterminate = !checkAll.checked && [...checkboxes].some(cb => cb.checked);
  }
}

function toggleSelecionadoCP(id) {
  if (selecionadosCP.has(id)) selecionadosCP.delete(id);
  else selecionadosCP.add(id);
  atualizarBulkBar('contaspagar');
  const checkAll = document.getElementById('checkTodosCP');
  if (checkAll) {
    const checkboxes = document.querySelectorAll('#tabelaCPBody input[type=checkbox]');
    checkAll.checked = checkboxes.length > 0 && [...checkboxes].every(cb => cb.checked);
    checkAll.indeterminate = !checkAll.checked && [...checkboxes].some(cb => cb.checked);
  }
}

function toggleTodosCobrancas() {
  const checkboxes = document.querySelectorAll('#tabelaBody input[type=checkbox]');
  const allChecked = [...checkboxes].every(cb => cb.checked);
  if (allChecked) {
    selecionadosCobrancas.clear();
    checkboxes.forEach(cb => { cb.checked = false; });
  } else {
    checkboxes.forEach(cb => { cb.checked = true; selecionadosCobrancas.add(cb.dataset.id); });
  }
  atualizarBulkBar('cobrancas');
}

function toggleTodosCP() {
  const checkboxes = document.querySelectorAll('#tabelaCPBody input[type=checkbox]');
  const allChecked = [...checkboxes].every(cb => cb.checked);
  if (allChecked) {
    selecionadosCP.clear();
    checkboxes.forEach(cb => { cb.checked = false; });
  } else {
    checkboxes.forEach(cb => { cb.checked = true; selecionadosCP.add(cb.dataset.id); });
  }
  atualizarBulkBar('contaspagar');
}

function atualizarBulkBar(colecao) {
  const bar = document.getElementById(colecao === 'cobrancas' ? 'bulkBarCobrancas' : 'bulkBarCP');
  const sel = colecao === 'cobrancas' ? selecionadosCobrancas : selecionadosCP;
  if (!bar) return;
  if (sel.size > 0) {
    bar.style.display = 'flex';
    const count = bar.querySelector('.bulk-count');
    if (count) count.textContent = `${sel.size} selecionado${sel.size !== 1 ? 's' : ''}`;
  } else {
    bar.style.display = 'none';
  }
}

function limparSelecaoCobrancas() {
  selecionadosCobrancas.clear();
  renderCobrancas();
}

function limparSelecaoCP() {
  selecionadosCP.clear();
  renderContasPagar();
}

function excluirSelecionadosCobrancas() {
  if (selecionadosCobrancas.size === 0) return;
  if (!confirm(`Excluir ${selecionadosCobrancas.size} cobrança${selecionadosCobrancas.size !== 1 ? 's' : ''}? Esta ação não pode ser desfeita.`)) return;
  const ids = [...selecionadosCobrancas];
  state.cobrancas = state.cobrancas.filter(c => !ids.includes(c.id));
  supabaseClient.from('cobrancas').delete().in('id', ids).then(({ error }) => {
    if (error) console.error('Erro ao excluir cobranças:', error);
  });
  selecionadosCobrancas.clear();
  renderCobrancas();
  if (viewAtual === 'dashboard') renderDashboard();
  toast(`${ids.length} cobrança${ids.length !== 1 ? 's' : ''} excluída${ids.length !== 1 ? 's' : ''}!`);
}

function excluirSelecionadosCP() {
  if (selecionadosCP.size === 0) return;
  if (!confirm(`Excluir ${selecionadosCP.size} conta${selecionadosCP.size !== 1 ? 's' : ''}? Esta ação não pode ser desfeita.`)) return;
  const ids = [...selecionadosCP];
  state.contasPagar = state.contasPagar.filter(cp => !ids.includes(cp.id));
  supabaseClient.from('contas_pagar').delete().in('id', ids).then(({ error }) => {
    if (error) console.error('Erro ao excluir contas:', error);
  });
  selecionadosCP.clear();
  renderContasPagar();
  if (viewAtual === 'dashboard') renderDashboard();
  toast(`${ids.length} conta${ids.length !== 1 ? 's' : ''} excluída${ids.length !== 1 ? 's' : ''}!`);
}

function abrirEdicaoEmMassaCobrancas() {
  if (selecionadosCobrancas.size === 0) return;
  document.getElementById('modalBulkCTitulo').textContent = `Editar ${selecionadosCobrancas.size} lançamento${selecionadosCobrancas.size !== 1 ? 's' : ''}`;
  // Popular categorias
  const sel = document.getElementById('bulkCCategoria');
  sel.innerHTML = '<option value="">— Manter original</option>' +
    state.categorias.map(cat => `<option value="${cat.nome}">${cat.nome}</option>`).join('');
  // Limpar campos
  document.getElementById('bulkCDescricao').value = '';
  document.getElementById('bulkCValor').value = '';
  sel.value = '';
  document.getElementById('bulkCRecorrencia').value = '';
  document.getElementById('bulkCObservacoes').value = '';
  document.getElementById('modalBulkCobrancasOverlay').classList.add('open');
  configurarCamposMoeda();
}

function fecharBulkCobrancas(event) {
  if (event && event.target !== document.getElementById('modalBulkCobrancasOverlay')) return;
  fecharBulkCobrancasForce();
}
function fecharBulkCobrancasForce() {
  document.getElementById('modalBulkCobrancasOverlay').classList.remove('open');
}

function salvarEdicaoEmMassaCobrancas(event) {
  event.preventDefault();
  const descricao = document.getElementById('bulkCDescricao').value.trim();
  const valorStr = document.getElementById('bulkCValor').value.trim();
  const valor = valorStr ? parseMoedaBR(valorStr) : null;
  const categoria = document.getElementById('bulkCCategoria').value;
  const recorrencia = document.getElementById('bulkCRecorrencia').value;
  const observacoes = document.getElementById('bulkCObservacoes').value.trim();

  if (!descricao && valor === null && !categoria && !recorrencia && observacoes === '') {
    toast('Preencha pelo menos um campo para alterar.', 'error');
    return;
  }

  const ids = [...selecionadosCobrancas];
  state.cobrancas.forEach((c, i) => {
    if (!ids.includes(c.id)) return;
    const updated = { ...c };
    if (descricao) updated.descricao = descricao;
    if (valor !== null) updated.valor = valor;
    if (categoria) updated.categoria = categoria;
    if (recorrencia) updated.recorrencia = recorrencia;
    if (observacoes) updated.observacoes = observacoes;
    state.cobrancas[i] = updated;
    supabaseClient.from('cobrancas').update(cobrancaParaDb(updated)).eq('id', c.id).then(({ error }) => {
      if (error) console.error('Erro ao atualizar cobrança:', error);
    });
  });

  fecharBulkCobrancasForce();
  selecionadosCobrancas.clear();
  renderCobrancas();
  if (viewAtual === 'dashboard') renderDashboard();
  toast(`${ids.length} cobrança${ids.length !== 1 ? 's' : ''} atualizada${ids.length !== 1 ? 's' : ''}!`, 'success');
}

function abrirEdicaoEmMassaCP() {
  if (selecionadosCP.size === 0) return;
  document.getElementById('modalBulkCPTitulo').textContent = `Editar ${selecionadosCP.size} lançamento${selecionadosCP.size !== 1 ? 's' : ''}`;
  // Limpar campos
  document.getElementById('bulkCPDescricao').value = '';
  document.getElementById('bulkCPValor').value = '';
  document.getElementById('bulkCPTipo').value = '';
  document.getElementById('bulkCPRecorrencia').value = '';
  document.getElementById('bulkCPObservacoes').value = '';
  document.getElementById('modalBulkCPOverlay').classList.add('open');
  configurarCamposMoeda();
}

function fecharBulkCP(event) {
  if (event && event.target !== document.getElementById('modalBulkCPOverlay')) return;
  fecharBulkCPForce();
}
function fecharBulkCPForce() {
  document.getElementById('modalBulkCPOverlay').classList.remove('open');
}

function salvarEdicaoEmMassaCP(event) {
  event.preventDefault();
  const descricao = document.getElementById('bulkCPDescricao').value.trim();
  const valorStr = document.getElementById('bulkCPValor').value.trim();
  const valor = valorStr ? parseMoedaBR(valorStr) : null;
  const tipo = document.getElementById('bulkCPTipo').value;
  const recorrencia = document.getElementById('bulkCPRecorrencia').value;
  const observacoes = document.getElementById('bulkCPObservacoes').value.trim();

  if (!descricao && valor === null && !tipo && !recorrencia && observacoes === '') {
    toast('Preencha pelo menos um campo para alterar.', 'error');
    return;
  }

  const ids = [...selecionadosCP];
  state.contasPagar.forEach((cp, i) => {
    if (!ids.includes(cp.id)) return;
    const updated = { ...cp };
    if (descricao) updated.descricao = descricao;
    if (valor !== null) updated.valor = valor;
    if (tipo) updated.tipo = tipo;
    if (recorrencia) updated.recorrencia = recorrencia;
    if (observacoes) updated.observacoes = observacoes;
    state.contasPagar[i] = updated;
    supabaseClient.from('contas_pagar').update(contaPagarParaDb(updated)).eq('id', cp.id).then(({ error }) => {
      if (error) console.error('Erro ao atualizar conta a pagar:', error);
    });
  });

  fecharBulkCPForce();
  selecionadosCP.clear();
  renderContasPagar();
  if (viewAtual === 'dashboard') renderDashboard();
  toast(`${ids.length} conta${ids.length !== 1 ? 's' : ''} atualizada${ids.length !== 1 ? 's' : ''}!`, 'success');
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
  const itemAtualizado = lista[idx];
  const tabela = baixaColecao === 'contaspagar' ? 'contas_pagar' : 'cobrancas';
  const toDb = baixaColecao === 'contaspagar' ? contaPagarParaDb : cobrancaParaDb;
  supabaseClient.from(tabela).update(toDb(itemAtualizado)).eq('id', itemAtualizado.id).then(({ error }) => {
    if (error) console.error('Erro ao registrar pagamento:', error);
  });
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
  supabaseClient.from('cobrancas').update(cobrancaParaDb(state.cobrancas[idx])).eq('id', id).then(({ error }) => {
    if (error) console.error('Erro ao desfazer baixa:', error);
  });
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
    if (d.status === 'pago') custosMap[chave].pago += d.valor;
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
  renderCategoriasSection('cobrancas');
  renderCategoriasSection('despesas');
  renderCategoriasSection('cp');
  popularCategoriasDespesasForm();
  popularCategoriasCP();
  renderEquipe();
  document.getElementById('conviteGerado').style.display = 'none';
}

function getCategoriasArray(tipo) {
  if (tipo === 'despesas') return state.categoriasDespesas;
  if (tipo === 'cp') return state.categoriasCP;
  return state.categorias;
}

function renderCategoriasSection(tipo) {
  const ids = {
    cobrancas: 'listaCategorias',
    despesas:  'listaCategoriasDespesas',
    cp:        'listaCategoriasCP',
  };
  const el = document.getElementById(ids[tipo]);
  if (!el) return;
  const arr = getCategoriasArray(tipo);
  if (arr.length === 0) {
    el.innerHTML = '<span style="color:var(--text-muted);font-size:13px">Nenhuma categoria</span>';
    return;
  }
  el.innerHTML = arr.map((c, i) => `
    <span class="tag" style="background:${c.cor}">
      ${c.nome}
      <button class="tag-remove" onclick="removerCategoriaSection('${tipo}',${i})" title="Remover">×</button>
    </span>
  `).join('');
}

function adicionarCategoriaSection(tipo) {
  const ids = { cobrancas: ['novaCategoria','corCategoria'], despesas: ['novaCategoriaDesp','corCategoriaDesp'], cp: ['novaCategoriaCP','corCategoriaCP'] };
  const [inputId, corId] = ids[tipo];
  const nome = document.getElementById(inputId).value.trim();
  const cor = document.getElementById(corId).value;
  if (!nome) return;
  const arr = getCategoriasArray(tipo);
  if (arr.find(c => c.nome.toLowerCase() === nome.toLowerCase())) { toast('Categoria já existe', 'error'); return; }
  arr.push({ nome, cor });
  salvarConfigSupabase();
  renderCategoriasSection(tipo);
  if (tipo === 'cobrancas') popularCategoriasForms();
  if (tipo === 'despesas') popularCategoriasDespesasForm();
  if (tipo === 'cp') popularCategoriasCP();
  document.getElementById(inputId).value = '';
  toast('Categoria adicionada!', 'success');
}

function removerCategoriaSection(tipo, idx) {
  const arr = getCategoriasArray(tipo);
  const cat = arr[idx];
  if (!confirm(`Remover "${cat.nome}"?`)) return;
  arr.splice(idx, 1);
  salvarConfigSupabase();
  renderCategoriasSection(tipo);
  if (tipo === 'cobrancas') popularCategoriasForms();
  if (tipo === 'despesas') popularCategoriasDespesasForm();
  if (tipo === 'cp') popularCategoriasCP();
  toast('Categoria removida');
}

// Manter compatibilidade com chamadas antigas de cobranças
function renderCategorias() { renderCategoriasSection('cobrancas'); }
function adicionarCategoria() { adicionarCategoriaSection('cobrancas'); }
function removerCategoria(idx) { removerCategoriaSection('cobrancas', idx); }

function popularCategoriasDespesasForm() {
  const sel = document.getElementById('dCategoria');
  if (sel) {
    sel.innerHTML = '<option value="">Sem categoria</option>' +
      state.categoriasDespesas.map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');
  }
}

function popularCategoriasCP() {
  const sel = document.getElementById('cpTipo');
  if (sel) {
    const val = sel.value;
    sel.innerHTML = '<option value="">Selecione...</option>' +
      state.categoriasCP.map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');
    sel.value = val;
  }
}

function salvarConfig() {
  const dias = parseInt(document.getElementById('diasAlerta').value);
  if (!dias || dias < 1) { toast('Informe um número válido de dias', 'error'); return; }
  state.config.diasAlerta = dias;
  salvarConfigSupabase();
  toast('Configurações salvas!', 'success');
}

function popularCategoriasForms() {
  const sel = document.getElementById('fCategoria');
  if (sel) {
    sel.innerHTML = '<option value="">Sem categoria</option>' +
      state.categorias.map(c => `<option value="${c.nome}">${c.nome}</option>`).join('');
  }
  popularCategoriasDespesasForm();
  popularCategoriasCP();
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
      supabaseClient.from('cobrancas').delete().neq('id', '').eq('empresa_id', state.empresaId).then(() => {
        supabaseClient.from('cobrancas').insert(state.cobrancas.map(c => cobrancaParaDb(c))).then(({ error }) => {
          if (error) console.error('Erro ao importar cobranças:', error);
        });
      });
      salvarConfigSupabase();
      navegarPara('dashboard');
      toast('Dados importados!', 'success');
    } catch (err) {
      toast('Arquivo inválido', 'error');
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

async function limparDados() {
  if (!confirm('Apagar TODOS os dados? Esta ação não pode ser desfeita.')) return;
  if (state.empresaId) {
    await Promise.all([
      supabaseClient.from('cobrancas').delete().eq('empresa_id', state.empresaId),
      supabaseClient.from('despesas').delete().eq('empresa_id', state.empresaId),
      supabaseClient.from('contas_pagar').delete().eq('empresa_id', state.empresaId),
    ]);
  }
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
  salvarConfigSupabase();
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
      <tr class="${selecionadosCP.has(cp.id) ? 'row-selected' : ''}">
        <td style="padding:0 8px"><input type="checkbox" data-id="${cp.id}" ${selecionadosCP.has(cp.id) ? 'checked' : ''} onchange="toggleSelecionadoCP('${cp.id}')"></td>
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
        <td>${cp.recorrencia !== 'nenhuma' ? `<span class="rec-badge">${cp.recorrencia}${cp.parcelaNum ? `<span class="parcela-tag">${cp.parcelaNum}/${cp.parcelaTotal}</span>` : ''}</span>` : '<span style="color:var(--text-light)">—</span>'}</td>
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

    // Atualizar estado do checkbox "selecionar todos"
    const checkAllCP = document.getElementById('checkTodosCP');
    if (checkAllCP) {
      const checkboxes = document.querySelectorAll('#tabelaCPBody input[type=checkbox]');
      checkAllCP.checked = checkboxes.length > 0 && [...checkboxes].every(cb => cb.checked);
      checkAllCP.indeterminate = !checkAllCP.checked && [...checkboxes].some(cb => cb.checked);
    }
  }
}

function abrirModalContaPagar(id) {
  document.getElementById('formContaPagar').reset();
  document.getElementById('editCPId').value = '';
  document.getElementById('modalCPTitulo').textContent = 'Nova Conta a Pagar';
  document.getElementById('cpVencimento').value = hoje();
  popularCategoriasCP();
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
  const grupo = document.getElementById('grupoRepetirCP');
  if (rec === 'nenhuma') {
    grupo.style.display = 'none';
    document.getElementById('grupoRemoverCP').style.display = 'none';
    return;
  }
  grupo.style.display = 'flex';
  if (editId) {
    document.getElementById('labelRepeticoesCP').textContent = 'Adicionar mais ocorrências';
    document.getElementById('spanRepeticoesCPHint').textContent = 'a partir da última data (0 = nenhuma)';
    document.getElementById('cpRepeticoes').value = 0;
    document.getElementById('cpRepeticoes').min = 0;
    document.getElementById('grupoRemoverCP').style.display = 'flex';
    document.getElementById('cpRemover').value = 0;
  } else {
    document.getElementById('labelRepeticoesCP').textContent = 'Repetir por';
    document.getElementById('spanRepeticoesCPHint').textContent = 'ocorrências';
    document.getElementById('cpRepeticoes').min = 1;
    document.getElementById('grupoRemoverCP').style.display = 'none';
    if (!document.getElementById('cpRepeticoes').value || document.getElementById('cpRepeticoes').value === '0') {
      document.getElementById('cpRepeticoes').value = 12;
    }
  }
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
  const repeticoes = parseInt(document.getElementById('cpRepeticoes').value) || 0;
  const removerCP = parseInt(document.getElementById('cpRemover').value) || 0;
  const observacoes = document.getElementById('cpObservacoes').value.trim();

  if (id) {
    const idx = state.contasPagar.findIndex(cp => cp.id === id);
    if (idx !== -1) {
      const original = state.contasPagar[idx];
      state.contasPagar[idx] = { ...original, descricao, tipo, dataVencimento, valor, recorrencia, observacoes };
      atualizarStatusAutoCP();
      supabaseClient.from('contas_pagar').update(contaPagarParaDb(state.contasPagar[idx])).eq('id', id).then(({ error }) => {
        if (error) console.error('Erro ao atualizar conta a pagar:', error);
      });

      // Perguntar se quer atualizar demais lançamentos da série
      const grupoId = original.grupoId;
      const temSiblings = grupoId && state.contasPagar.some(cp => cp.grupoId === grupoId && cp.id !== id);
      if (original.recorrencia && original.recorrencia !== 'nenhuma' && temSiblings) {
        if (confirm('Este lançamento faz parte de uma série recorrente.\nDeseja atualizar os demais lançamentos da série também?\n\n(Datas de vencimento e status de pagamento não serão alterados)')) {
          state.contasPagar.forEach((cp, i) => {
            if (cp.grupoId === grupoId && cp.id !== id) {
              state.contasPagar[i] = { ...cp, descricao, tipo, valor, recorrencia, observacoes };
              supabaseClient.from('contas_pagar').update(contaPagarParaDb(state.contasPagar[i])).eq('id', cp.id).then(({ error }) => {
                if (error) console.error('Erro ao atualizar conta recorrente:', error);
              });
            }
          });
          atualizarStatusAutoCP();
        }
      }

      // Adicionar novas ocorrências se solicitado
      if (recorrencia !== 'nenhuma' && repeticoes > 0) {
        const serieGrupoId = grupoId || id;
        const serie = state.contasPagar.filter(cp => cp.grupoId === serieGrupoId || cp.id === serieGrupoId);
        const ultimaData = serie.reduce((max, cp) => cp.dataVencimento > max ? cp.dataVencimento : max, dataVencimento);
        const diaOriginal = new Date(dataVencimento + 'T00:00:00').getDate();
        let base = proximaData(new Date(ultimaData + 'T00:00:00'), recorrencia, diaOriginal);
        const maxParcelaAtual = serie.reduce((max, cp) => Math.max(max, cp.parcelaNum || 0), 0);
        const novoTotal = maxParcelaAtual + repeticoes;
        const novas = [];
        for (let i = 0; i < repeticoes; i++) {
          const dStr = base.toISOString().slice(0, 10);
          const nova = {
            id: uid(), descricao, tipo, dataVencimento: dStr, valor, recorrencia, observacoes,
            status: 'pendente', dataPagamento: null, valorPago: null,
            criadoEm: new Date().toISOString(), grupoId: serieGrupoId,
            parcelaNum: maxParcelaAtual + i + 1, parcelaTotal: novoTotal,
          };
          nova.status = calcularStatusCP(nova);
          state.contasPagar.push(nova);
          novas.push(nova);
          base = proximaData(base, recorrencia, diaOriginal);
        }
        // Atualizar parcelaTotal em toda a série existente
        state.contasPagar.forEach((cp, i) => {
          if ((cp.grupoId === serieGrupoId || cp.id === serieGrupoId) && !novas.includes(cp)) {
            state.contasPagar[i] = { ...cp, parcelaTotal: novoTotal };
          }
        });
        supabaseClient.from('contas_pagar').insert(novas.map(cp => contaPagarParaDb(cp))).then(({ error }) => {
          if (error) console.error('Erro ao inserir novas ocorrências:', error);
        });
        supabaseClient.from('contas_pagar').update({ parcela_total: novoTotal })
          .eq('grupo_id', serieGrupoId).then(({ error }) => {
            if (error) console.error('Erro ao atualizar parcela_total:', error);
          });
        toast(`Conta atualizada + ${repeticoes} ocorrência${repeticoes !== 1 ? 's' : ''} adicionada${repeticoes !== 1 ? 's' : ''}!`, 'success');
        fecharModalCPForce();
        if (viewAtual === 'contaspagar') renderContasPagar();
        if (viewAtual === 'dashboard') renderDashboard();
        return;
      }

      // Remover ocorrências futuras não pagas se solicitado
      if (recorrencia !== 'nenhuma' && removerCP > 0) {
        const serieGrupoId = grupoId || id;
        const futuras = state.contasPagar
          .filter(cp => (cp.grupoId === serieGrupoId || cp.id === serieGrupoId) && cp.id !== id && cp.status !== 'pago')
          .sort((a, b) => b.dataVencimento.localeCompare(a.dataVencimento));
        const aRemover = futuras.slice(0, removerCP);
        if (aRemover.length > 0) {
          const idsRemover = aRemover.map(cp => cp.id);
          state.contasPagar = state.contasPagar.filter(cp => !idsRemover.includes(cp.id));
          supabaseClient.from('contas_pagar').delete().in('id', idsRemover).then(({ error }) => {
            if (error) console.error('Erro ao remover ocorrências:', error);
          });
          toast(`Conta atualizada — ${aRemover.length} ocorrência${aRemover.length !== 1 ? 's' : ''} removida${aRemover.length !== 1 ? 's' : ''}!`, 'success');
          fecharModalCPForce();
          if (viewAtual === 'contaspagar') renderContasPagar();
          if (viewAtual === 'dashboard') renderDashboard();
          return;
        }
      }
    }
    toast('Conta atualizada!', 'success');
  } else {
    const qtd = recorrencia !== 'nenhuma' ? repeticoes : 1;
    let base = new Date(dataVencimento + 'T00:00:00');
    const diaOriginal = base.getDate();
    const novasCP = [];
    const grupoId = recorrencia !== 'nenhuma' ? uid() : null;
    for (let i = 0; i < qtd; i++) {
      const dStr = base.toISOString().slice(0, 10);
      const novaCP = {
        id: uid(), descricao, tipo, dataVencimento: dStr, valor, recorrencia, observacoes,
        status: 'pendente', dataPagamento: null, valorPago: null,
        criadoEm: new Date().toISOString(), grupoId,
        parcelaNum:   recorrencia !== 'nenhuma' ? i + 1 : null,
        parcelaTotal: recorrencia !== 'nenhuma' ? qtd    : null,
      };
      novaCP.status = calcularStatusCP(novaCP);
      state.contasPagar.push(novaCP);
      novasCP.push(novaCP);
      base = proximaData(base, recorrencia, diaOriginal);
    }
    supabaseClient.from('contas_pagar').insert(novasCP.map(cp => contaPagarParaDb(cp))).then(({ error }) => {
      if (error) console.error('Erro ao inserir contas a pagar:', error);
    });
    toast(`${qtd > 1 ? qtd + ' contas criadas' : 'Conta criada'}!`, 'success');
  }
  fecharModalCPForce();
  if (viewAtual === 'contaspagar') renderContasPagar();
  if (viewAtual === 'dashboard') renderDashboard();
}

function excluirContaPagar(id) {
  const cp = state.contasPagar.find(x => x.id === id);
  if (!cp) return;
  if (!confirm(`Excluir "${cp.descricao}"?`)) return;
  state.contasPagar = state.contasPagar.filter(x => x.id !== id);
  supabaseClient.from('contas_pagar').delete().eq('id', id).then(({ error }) => {
    if (error) console.error('Erro ao excluir conta a pagar:', error);
  });
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
  supabaseClient.from('contas_pagar').update(contaPagarParaDb(state.contasPagar[idx])).eq('id', id).then(({ error }) => {
    if (error) console.error('Erro ao desfazer baixa de conta a pagar:', error);
  });
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

  // Despesa: datalist para digitação livre
  const datalistD = document.getElementById('clientesDespesaList');
  if (datalistD) {
    datalistD.innerHTML = state.clientes.map(c => `<option value="${c.nome}"></option>`).join('');
  }

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
            ${c.contract_url ? `<a class="btn-icon" title="Ver Contrato" href="${c.contract_url}" target="_blank" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>
            </a>` : ''}
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
  // Reset contract area
  limparContrato();
  const contratoAtualDiv = document.getElementById('contratoAtual');
  if (contratoAtualDiv) contratoAtualDiv.style.display = 'none';
  if (id) {
    const c = state.clientes.find(x => x.id === id);
    if (!c) return;
    document.getElementById('editClienteId').value = c.id;
    document.getElementById('modalClienteTitulo').textContent = 'Editar Cliente';
    document.getElementById('cNome').value = c.nome;
    document.getElementById('cCpfCnpj').value = c.cpf_cnpj || '';
    document.getElementById('cTelefone').value = c.telefone || '';
    document.getElementById('cEmail').value = c.email || '';
    document.getElementById('cEndereco').value = c.endereco || '';
    if (c.contract_url) {
      const preview = document.getElementById('contractPreview');
      if (preview) { preview.style.display = 'none'; }
      if (contratoAtualDiv) {
        contratoAtualDiv.style.display = 'flex';
        const link = document.getElementById('contratoLink');
        if (link) link.href = c.contract_url;
      }
    }
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
  const btnSalvar = document.getElementById('btnSalvarCliente');
  if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.textContent = 'Salvando...'; }

  const dados = {
    nome: document.getElementById('cNome').value.trim(),
    cpf_cnpj: document.getElementById('cCpfCnpj').value.trim(),
    telefone: document.getElementById('cTelefone').value.trim(),
    email: document.getElementById('cEmail').value.trim(),
    endereco: document.getElementById('cEndereco').value.trim(),
    empresa_id: state.empresaId,
    user_id: state.meuPerfil?.userId,
  };

  // Upload de contrato se selecionado
  const fileInput = document.getElementById('cContrato');
  if (fileInput?.files?.length) {
    const file = fileInput.files[0];
    const clienteIdUpload = id || uid();
    const filePath = `${state.empresaId}/${clienteIdUpload}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('contratos')
      .upload(filePath, file, { upsert: true });
    if (uploadError) {
      console.error('Erro upload contrato:', uploadError);
      toast('Erro ao enviar contrato: ' + uploadError.message, 'error');
    } else {
      const { data: urlData } = supabaseClient.storage.from('contratos').getPublicUrl(uploadData.path);
      dados.contract_url = urlData.publicUrl;
    }
  }

  if (id) {
    const { error } = await supabaseClient.from('clientes').update(dados).eq('id', id);
    if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.textContent = 'Salvar'; }
    if (error) { console.error(error); toast('Erro ao atualizar cliente', 'error'); return; }
    toast('Cliente atualizado!', 'success');
  } else {
    const { error } = await supabaseClient.from('clientes').insert([dados]);
    if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.textContent = 'Salvar'; }
    if (error) { console.error(error); toast('Erro ao cadastrar cliente', 'error'); return; }
    toast('Cliente cadastrado!', 'success');
  }

const { data: clientesAtualizados } = await supabaseClient
  .from('clientes').select('*').eq('empresa_id', state.empresaId).order('created_at', { ascending: false });
state.clientes = clientesAtualizados || [];
popularClientesForms();
renderClientes();
fecharModalClienteForce();
}


async function excluirCliente(id) {
  const c = state.clientes.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`Excluir cliente "${c.nome}"?`)) return;
  const { error } = await supabaseClient.from('clientes').delete().eq('id', id);
  if (error) {
    console.error('Erro ao excluir cliente:', error);
    toast('Erro ao excluir cliente', 'error');
    return;
  }
  state.clientes = state.clientes.filter(x => x.id !== id);
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
  const totalPago = lista.filter(d => d.status === 'pago').reduce((s, d) => s + d.valor, 0);
  document.getElementById('despesas-summary').innerHTML = `
    <span>${lista.length} registro${lista.length !== 1 ? 's' : ''}</span>
    <span>Pendente: <strong>${fmt(totalPend)}</strong></span>
    <span>Pago: <strong>${fmt(totalPago)}</strong></span>
  `;

  const tbody = document.getElementById('tabelaDespesasBody');
  const empty = document.getElementById('emptyStateDespesas');

  if (lista.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'flex';
  } else {
    empty.style.display = 'none';
    tbody.innerHTML = lista.map(d => {
      const clienteDisplay = d.clienteId
        ? nomeCliente(d.clienteId)
        : (d.clienteNome ? `<span style="font-weight:600">${d.clienteNome}</span>` : '<span style="color:var(--text-light)">—</span>');
      return `
      <tr>
        <td style="font-weight:600">${clienteDisplay}</td>
        <td>
          <div>${d.descricao}</div>
          ${d.observacoes ? `<div style="font-size:11px;color:var(--text-muted)">${d.observacoes}</div>` : ''}
        </td>
        <td style="white-space:nowrap">${fmtData(d.data)}</td>
        <td style="font-weight:700;white-space:nowrap">${fmt(d.valor)}</td>
        <td><span class="badge ${d.status === 'pendente' ? 'badge-pendente' : 'badge-pago'}">${d.status === 'pago' ? 'Pago' : 'Pendente'}</span></td>
        <td>
          <div class="actions">
            ${d.status === 'pendente'
              ? `<button class="btn-icon success" title="Marcar como pago" onclick="marcarDespesaPaga('${d.id}')">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                 </button>`
              : `<button class="btn-icon success" title="Gerar Recibo" onclick="gerarReciboDespesa('${d.id}')">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                 </button>`}
            <button class="btn-icon" title="Editar" onclick="abrirModalDespesa('${d.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon danger" title="Excluir" onclick="excluirDespesa('${d.id}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }
}

function abrirModalDespesa(id, preClienteId) {
  document.getElementById('formDespesa').reset();
  document.getElementById('editDespesaId').value = '';
  document.getElementById('modalDespesaTitulo').textContent = 'Nova Despesa Reembolsável';
  document.getElementById('dData').value = hoje();
  popularCategoriasDespesasForm();
  // Pre-select client by ID
  if (preClienteId) {
    const c = state.clientes.find(x => x.id === preClienteId);
    if (c) document.getElementById('dCliente').value = c.nome;
  }
  if (id) {
    const d = state.despesas.find(x => x.id === id);
    if (!d) return;
    document.getElementById('editDespesaId').value = d.id;
    document.getElementById('modalDespesaTitulo').textContent = 'Editar Despesa Reembolsável';
    const clienteNomeDisplay = d.clienteId ? (nomeClienteTexto(d.clienteId) || d.clienteNome || '') : (d.clienteNome || '');
    document.getElementById('dCliente').value = clienteNomeDisplay;
    document.getElementById('dDescricao').value = d.descricao;
    document.getElementById('dData').value = d.data;
    document.getElementById('dValor').value = fmtNumeroBR(d.valor);
    if (document.getElementById('dCategoria')) document.getElementById('dCategoria').value = d.categoria || '';
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
  const clienteTexto = document.getElementById('dCliente').value.trim();
  const clienteExistente = state.clientes.find(c => c.nome.toLowerCase() === clienteTexto.toLowerCase());
  const dados = {
    clienteId: clienteExistente ? clienteExistente.id : null,
    clienteNome: clienteTexto ? clienteTexto.toUpperCase() : null,
    descricao: document.getElementById('dDescricao').value.trim(),
    data: document.getElementById('dData').value,
    valor: parseMoedaBR(document.getElementById('dValor').value),
    categoria: document.getElementById('dCategoria')?.value || null,
    observacoes: document.getElementById('dObservacoes').value.trim(),
  };
  if (id) {
    const idx = state.despesas.findIndex(d => d.id === id);
    if (idx !== -1) {
      state.despesas[idx] = { ...state.despesas[idx], ...dados };
      supabaseClient.from('despesas').update(despesaParaDb(state.despesas[idx])).eq('id', id).then(({ error }) => {
        if (error) console.error('Erro ao atualizar despesa:', error);
      });
    }
    toast('Despesa atualizada!', 'success');
  } else {
    const nova = { id: uid(), ...dados, status: 'pendente', criadoEm: new Date().toISOString() };
    state.despesas.push(nova);
    supabaseClient.from('despesas').insert([despesaParaDb(nova)]).then(({ error }) => {
      if (error) console.error('Erro ao inserir despesa:', error);
    });
    toast('Despesa registrada!', 'success');
  }
  fecharModalDespesaForce();
  if (viewAtual === 'despesas') renderDespesas();
  if (viewAtual === 'clientes') renderClientes();
}

function excluirDespesa(id) {
  if (!confirm('Excluir esta despesa?')) return;
  state.despesas = state.despesas.filter(d => d.id !== id);
  supabaseClient.from('despesas').delete().eq('id', id).then(({ error }) => {
    if (error) console.error('Erro ao excluir despesa:', error);
  });
  renderDespesas();
  toast('Despesa excluída');
}

function marcarDespesaPaga(id) {
  const idx = state.despesas.findIndex(d => d.id === id);
  if (idx === -1) return;
  state.despesas[idx].status = 'pago';
  supabaseClient.from('despesas').update(despesaParaDb(state.despesas[idx])).eq('id', id).then(({ error }) => {
    if (error) console.error('Erro ao marcar despesa como paga:', error);
  });
  renderDespesas();
  toast('Despesa marcada como paga', 'success');
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
  salvarConfigSupabase();
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
            <div class="doc-office">Fluxo 360</div>
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
          ${cliente.cpf_cnpj ? `<div><span class="doc-label">CPF / CNPJ: </span>${cliente.cpf_cnpj}</div>` : ''}
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
    if (idx !== -1) {
      state.despesas[idx].status = 'pago';
      supabaseClient.from('despesas').update(despesaParaDb(state.despesas[idx])).eq('id', d.id).then(({ error }) => {
        if (error) console.error('Erro ao marcar despesa como paga:', error);
      });
    }
  });

  document.getElementById('printOverlay').classList.add('open');
}

// ===== RECIBO DE PAGAMENTO =====
function gerarRecibo(cobrancaId) {
  const c = state.cobrancas.find(x => x.id === cobrancaId);
  if (!c || c.status !== 'pago') return;

  state.contadores.recibo = (state.contadores.recibo || 0) + 1;
  salvarConfigSupabase();
  const numero = String(state.contadores.recibo).padStart(4, '0');
  const cliente = c.clienteId ? state.clientes.find(x => x.id === c.clienteId) : null;
  const valorPago = c.valorPago || c.valor;

  document.getElementById('printDoc').innerHTML = `
    <div class="doc-paper">
      <div class="doc-header">
        <div class="doc-logo">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          <div>
            <div class="doc-office">Fluxo 360</div>
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
          ${cliente.cpf_cnpj ? `<div><span class="doc-label">CPF / CNPJ: </span>${cliente.cpf_cnpj}</div>` : ''}
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

// ===== RECIBO DE DESPESA =====
function gerarReciboDespesa(despesaId) {
  const d = state.despesas.find(x => x.id === despesaId);
  if (!d || d.status !== 'pago') return;

  state.contadores.recibo = (state.contadores.recibo || 0) + 1;
  salvarConfigSupabase();
  const numero = String(state.contadores.recibo).padStart(4, '0');
  const cliente = d.clienteId ? state.clientes.find(x => x.id === d.clienteId) : null;
  const clienteNomeDisplay = cliente ? cliente.nome : (d.clienteNome || '');

  document.getElementById('printDoc').innerHTML = `
    <div class="doc-paper">
      <div class="doc-header">
        <div class="doc-logo">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          <div>
            <div class="doc-office">${state.empresaNome || 'Fluxo 360'}</div>
            <div class="doc-office-sub">Recibo de Despesa</div>
          </div>
        </div>
        <div class="doc-title-block">
          <div class="doc-title">RECIBO DE DESPESA</div>
          <div class="doc-meta">Nº ${numero}</div>
          <div class="doc-meta">Data: ${fmtData(d.data)}</div>
        </div>
      </div>

      <div class="doc-recibo-valor">
        <div class="doc-recibo-valor-label">Valor da Despesa</div>
        <div class="doc-recibo-valor-num">${fmt(d.valor)}</div>
      </div>

      ${clienteNomeDisplay ? `
      <div class="doc-section">
        <div class="doc-section-title">Cliente</div>
        <div class="doc-client-grid">
          <div><span class="doc-label">Nome / Razão Social: </span><strong>${clienteNomeDisplay}</strong></div>
          ${cliente?.cpf_cnpj ? `<div><span class="doc-label">CPF / CNPJ: </span>${cliente.cpf_cnpj}</div>` : ''}
          ${cliente?.email ? `<div><span class="doc-label">Email: </span>${cliente.email}</div>` : ''}
          ${cliente?.telefone ? `<div><span class="doc-label">Telefone: </span>${cliente.telefone}</div>` : ''}
        </div>
      </div>` : ''}

      <div class="doc-section">
        <div class="doc-section-title">Referente a</div>
        <div class="doc-client-grid">
          <div><span class="doc-label">Descrição: </span><strong>${d.descricao}</strong></div>
          <div><span class="doc-label">Data: </span>${fmtData(d.data)}</div>
          ${d.observacoes ? `<div style="grid-column:1/-1"><span class="doc-label">Obs: </span>${d.observacoes}</div>` : ''}
        </div>
      </div>

      <div class="doc-footer">
        <div class="doc-sign-block"><div class="doc-sign-line"></div><div class="doc-sign-label">Assinatura do Emitente</div></div>
        <div class="doc-sign-block"><div class="doc-sign-line"></div><div class="doc-sign-label">Assinatura do Cliente</div></div>
      </div>
      <div class="doc-obs">Recibo emitido em ${fmtData(hoje())}. Este documento confirma a despesa acima discriminada.</div>
    </div>
  `;
  document.getElementById('printOverlay').classList.add('open');
}

function fecharPrintOverlay() {
  document.getElementById('printOverlay').classList.remove('open');
}

// ===== USUÁRIOS =====
async function renderUsuarios() {
  const el = document.getElementById('listaUsuarios');
  const btnConvidar = document.getElementById('btnConvidarUsuario');
  if (!el || !state.empresaId) return;

  const isAdmin = isAdm();
  if (btnConvidar) btnConvidar.style.display = isAdmin ? 'flex' : 'none';

  const { data: membros, error } = await supabaseClient
    .from('usuarios_empresa')
    .select('*')
    .eq('empresa_id', state.empresaId)
    .order('criado_em', { ascending: true });

  if (error || !membros?.length) {
    el.innerHTML = '<div class="empty-state" style="padding:20px 0"><p>Nenhum membro encontrado.</p></div>';
    return;
  }

  const perfisOpcoes = [
    { value: 'admin',       label: 'Administrador' },
    { value: 'operador',    label: 'Operador' },
    { value: 'colaborador', label: 'Colaborador' },
    { value: 'controler',   label: 'Controler' },
    { value: 'financeiro',  label: 'Financeiro' },
  ];

  el.innerHTML = membros.map(m => {
    const ini = (m.nome || '?').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const isMe = m.user_id === state.meuPerfil?.userId;
    const perfilInfo = PERFIS[m.perfil] || { label: m.perfil, cor: 'badge-pendente' };
    const nomeEsc = m.nome.replace(/'/g, "\\'");
    const editando = isAdmin && !isMe && editarMembroAtivo === m.user_id;
    const optsHtml = perfisOpcoes.map(o => `<option value="${o.value}" ${m.perfil === o.value ? 'selected' : ''}>${o.label}</option>`).join('');

    return `
      <div class="team-member-item">
        <div class="team-avatar">${ini}</div>
        <div class="team-info">
          <div class="team-nome">${m.nome}${isMe ? ' <span style="font-size:11px;color:var(--text-muted)">(você)</span>' : ''}</div>
          <div class="team-desde">${m.cargo ? `${m.cargo} · ` : ''}Desde ${fmtData(m.criado_em?.slice(0, 10))}</div>
        </div>
        <div class="team-actions">
          ${editando ? `
            <select class="perfil-select" id="selectMembro_${m.user_id}">${optsHtml}</select>
            <button class="btn-icon success" title="Confirmar" onclick="confirmarPerfilMembro('${m.user_id}','${nomeEsc}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <button class="btn-icon" title="Cancelar" onclick="cancelarEdicaoMembro()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          ` : `
            <span class="badge ${perfilInfo.cor}">${perfilInfo.label}</span>
            ${isAdmin && !isMe ? `
              <button class="btn-icon" title="Editar perfil" onclick="iniciarEdicaoMembro('${m.user_id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </button>
            ` : ''}
          `}
          ${isAdmin && !isMe ? `
          <button class="btn-icon danger" title="Remover da equipe" onclick="removerMembro('${m.user_id}','${nomeEsc}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>` : ''}
        </div>
      </div>`;
  }).join('');
}

function iniciarEdicaoMembro(userId) {
  editarMembroAtivo = userId;
  renderUsuarios();
}

function cancelarEdicaoMembro() {
  editarMembroAtivo = null;
  renderUsuarios();
}

async function confirmarPerfilMembro(userId, nome) {
  if (!isAdm()) return;
  const sel = document.getElementById(`selectMembro_${userId}`);
  if (!sel) return;
  const novoPerfil = sel.value;
  const { error } = await supabaseClient
    .from('usuarios_empresa')
    .update({ perfil: novoPerfil })
    .eq('user_id', userId)
    .eq('empresa_id', state.empresaId);
  if (error) { toast('Erro ao alterar perfil', 'error'); return; }
  toast(`${nome} agora é ${PERFIS[novoPerfil]?.label || novoPerfil}`, 'success');
  editarMembroAtivo = null;
  renderUsuarios();
}

async function alterarPerfilMembro(userId, novoPerfil, nome) {
  // mantido por compatibilidade
  const { error } = await supabaseClient
    .from('usuarios_empresa')
    .update({ perfil: novoPerfil })
    .eq('user_id', userId)
    .eq('empresa_id', state.empresaId);
  if (error) { toast('Erro ao alterar perfil', 'error'); return; }
  const perfilLabel = PERFIS[novoPerfil]?.label || novoPerfil;
  toast(`${nome} agora é ${perfilLabel}`, 'success');
  renderUsuarios();
}

async function removerMembro(userId, nome) {
  if (!isAdm()) return;
  if (!confirm(`Remover "${nome}" da equipe? O usuário perderá o acesso à empresa.`)) return;
  const { error } = await supabaseClient
    .from('usuarios_empresa')
    .delete()
    .eq('user_id', userId)
    .eq('empresa_id', state.empresaId);
  if (error) { toast('Erro ao remover membro', 'error'); return; }
  toast('Membro removido');
  renderUsuarios();
}

function abrirConviteUsuarios() {
  const sec = document.getElementById('secaoConviteUsuarios');
  if (sec) sec.style.display = sec.style.display === 'none' ? '' : 'none';
}

async function gerarConviteUsuarios() {
  if (!isAdm()) {
    toast('Apenas administradores podem gerar convites.', 'error');
    return;
  }
  const { data: sessao } = await supabaseClient.auth.getSession();
  const { data: convite, error } = await supabaseClient
    .from('convites_empresa')
    .insert([{ empresa_id: state.empresaId, criado_por: sessao.session.user.id }])
    .select()
    .single();
  if (error) { toast('Erro ao gerar convite.', 'error'); return; }

  const emailConvidado = document.getElementById('conviteEmailUsuario')?.value.trim() || '';
  const mailtoLink = emailConvidado
    ? `mailto:${emailConvidado}?subject=Convite%20Fluxo%20360&body=Voc%C3%AA%20foi%20convidado%20para%20a%20empresa%20${encodeURIComponent(state.empresaNome || 'Fluxo 360')}%20no%20Fluxo%20360.%0A%0ACrie%20uma%20conta%20em%20${encodeURIComponent(window.location.origin)}%20e%20use%20o%20c%C3%B3digo%3A%20${convite.codigo}`
    : '';

  const box = document.getElementById('conviteGeradoUsuarios');
  box.style.display = '';
  box.innerHTML = `
    <div class="invite-code-box">
      <div style="flex:1">
        <div class="invite-code">${convite.codigo}</div>
        <div class="invite-instructions">Compartilhe este código. Ele só pode ser usado uma vez.</div>
        ${emailConvidado ? `<div style="margin-top:6px;font-size:12px;color:var(--text-muted)">Para: <strong>${emailConvidado}</strong></div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button class="btn btn-outline" onclick="navigator.clipboard.writeText('${convite.codigo}').then(()=>toast('Código copiado!','success'))">Copiar</button>
        ${mailtoLink ? `<a class="btn btn-outline" style="text-decoration:none;font-size:12px;display:flex;align-items:center;justify-content:center" href="${mailtoLink}">Email</a>` : ''}
      </div>
    </div>`;
}

// Contrato do cliente
function previewContrato(event) {
  const file = event.target.files[0];
  if (!file) return;
  const preview = document.getElementById('contractPreview');
  if (preview) {
    preview.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <span style="font-size:12px;color:var(--text)">${file.name}</span>
      <button type="button" style="background:none;border:none;cursor:pointer;color:var(--danger);padding:0;margin-left:4px" onclick="limparContrato()">✕</button>`;
  }
}

function limparContrato() {
  document.getElementById('cContrato').value = '';
  const preview = document.getElementById('contractPreview');
  if (preview) {
    preview.className = 'contract-preview-empty';
    preview.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      <span>Clique para anexar contrato</span>`;
  }
}

// ===== NOTIFICAÇÕES =====
async function carregarNotificacoes() {
  if (!state.meuPerfil || !state.empresaId) return;
  const { data } = await supabaseClient
    .from('notificacoes')
    .select('*')
    .eq('user_id', state.meuPerfil.userId)
    .eq('empresa_id', state.empresaId)
    .order('created_at', { ascending: false })
    .limit(30);
  state.notificacoes = data || [];
  renderBadgeNotificacoes();
}

function renderBadgeNotificacoes() {
  const naoLidas = (state.notificacoes || []).filter(n => !n.lida).length;
  const badge = document.getElementById('notifBadge');
  if (badge) { badge.textContent = naoLidas > 9 ? '9+' : naoLidas; badge.style.display = naoLidas > 0 ? '' : 'none'; }
}

function abrirNotificacoes() {
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : '';
  if (!isOpen) renderNotificacoesPanel();
  // Fechar ao clicar fora
  if (!isOpen) {
    setTimeout(() => {
      document.addEventListener('click', function fecharFora(e) {
        if (!panel.contains(e.target) && !e.target.closest('.btn-notif')) {
          panel.style.display = 'none';
          document.removeEventListener('click', fecharFora);
        }
      });
    }, 100);
  }
}

function renderNotificacoesPanel() {
  const lista = document.getElementById('notifLista');
  if (!lista) return;
  const notifs = state.notificacoes || [];
  if (!notifs.length) {
    lista.innerHTML = '<div class="notif-empty">Nenhuma notificação</div>';
    return;
  }
  lista.innerHTML = notifs.map(n => `
    <div class="notif-item${n.lida ? ' notif-lida' : ''}" onclick="marcarNotificacaoLida('${n.id}')">
      <div class="notif-titulo">${n.titulo}</div>
      ${n.mensagem ? `<div class="notif-msg">${n.mensagem}</div>` : ''}
      <div class="notif-hora">${fmtDataHora(n.created_at)}</div>
    </div>
  `).join('');
}

async function marcarNotificacaoLida(id) {
  await supabaseClient.from('notificacoes').update({ lida: true }).eq('id', id);
  const n = (state.notificacoes || []).find(n => n.id === id);
  if (n) n.lida = true;
  renderBadgeNotificacoes();
  renderNotificacoesPanel();
}

async function marcarTodasLidas() {
  const ids = (state.notificacoes || []).filter(n => !n.lida).map(n => n.id);
  if (!ids.length) return;
  await supabaseClient.from('notificacoes').update({ lida: true }).in('id', ids);
  (state.notificacoes || []).forEach(n => { n.lida = true; });
  renderBadgeNotificacoes();
  renderNotificacoesPanel();
}

async function notificarControlersNovaCobranca(cobranca) {
  if (!state.empresaId) return;
  const { data: controlers } = await supabaseClient
    .from('usuarios_empresa')
    .select('user_id')
    .eq('empresa_id', state.empresaId)
    .eq('perfil', 'controler');
  if (!controlers?.length) return;

  const quemLancou = state.meuPerfil?.nome || 'Usuário';
  const notifs = controlers.map(c => ({
    empresa_id: state.empresaId,
    user_id: c.user_id,
    tipo: 'nova_cobranca',
    titulo: 'Nova cobrança — emitir NF',
    mensagem: `${cobranca.clienteNome || 'Cliente'} · ${cobranca.descricao || ''} · ${fmt(cobranca.valor)} · Lançado por ${quemLancou}`,
    dados: { cobranca_id: cobranca.id, valor: cobranca.valor, cliente: cobranca.clienteNome },
  }));
  await supabaseClient.from('notificacoes').insert(notifs);
}

// ===== NOTAS FISCAIS =====
function renderNotasFiscais() {
  const el = document.getElementById('listaNotasFiscais');
  if (!el) return;

  const nfs = state.notasFiscais || [];

  if (!nfs.length) {
    el.innerHTML = `<div class="empty-state"><p>Nenhuma nota fiscal cadastrada.</p></div>`;
    return;
  }

  el.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Cliente</th>
          <th>Data</th>
          <th>Valor</th>
          <th>Descrição</th>
          <th>Arquivo</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${nfs.map(nf => {
          const nomeCliente = nf.clienteNome || (state.clientes.find(c => c.id === nf.clienteId)?.nome) || '—';
          return `
            <tr>
              <td>${nomeCliente}</td>
              <td>${fmtData(nf.dataNota)}</td>
              <td>${fmt(nf.valor)}</td>
              <td>${nf.descricao || '—'}</td>
              <td>
                ${nf.arquivoUrl
                  ? `<a href="${nf.arquivoUrl}" target="_blank" class="btn-icon" title="Baixar NF" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </a>`
                  : '<span style="color:var(--text-muted);font-size:12px">—</span>'}
              </td>
              <td>
                ${(isAdm() || isFinanceiro() || isControler()) ? `
                  <button class="btn-icon" title="Editar" onclick="abrirModalNotaFiscal('${nf.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                  </button>
                ` : ''}
                ${(isAdm() || isFinanceiro()) ? `
                  <button class="btn-icon danger" title="Excluir" onclick="excluirNotaFiscal('${nf.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                  </button>
                ` : ''}
              </td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function abrirModalNotaFiscal(id) {
  const overlay = document.getElementById('modalNotaFiscalOverlay');
  if (!overlay) return;

  const nf = id ? state.notasFiscais.find(x => x.id === id) : null;

  overlay.dataset.id = id || '';
  document.getElementById('nfClienteId').value = nf?.clienteId || '';
  document.getElementById('nfClienteNome').value = nf?.clienteNome || '';
  document.getElementById('nfData').value = nf?.dataNota || hoje();
  document.getElementById('nfValor').value = nf ? fmtNumeroBR(nf.valor) : '';
  document.getElementById('nfDescricao').value = nf?.descricao || '';
  document.getElementById('nfObservacoes').value = nf?.observacoes || '';
  document.getElementById('nfArquivoAtual').style.display = nf?.arquivoUrl ? '' : 'none';
  if (nf?.arquivoUrl) {
    document.getElementById('nfArquivoLink').href = nf.arquivoUrl;
  }
  document.getElementById('nfArquivo').value = '';

  // Popular select de clientes
  const sel = document.getElementById('nfClienteId');
  sel.innerHTML = '<option value="">— Informar nome manualmente —</option>' +
    state.clientes.map(c => `<option value="${c.id}" ${nf?.clienteId === c.id ? 'selected' : ''}>${c.nome}</option>`).join('');

  overlay.classList.add('open');
}

function fecharModalNotaFiscal(event) {
  if (event.target === document.getElementById('modalNotaFiscalOverlay')) fecharModalNotaFiscalForce();
}

function fecharModalNotaFiscalForce() {
  document.getElementById('modalNotaFiscalOverlay')?.classList.remove('open');
}

async function salvarNotaFiscal(event) {
  event.preventDefault();
  const overlay = document.getElementById('modalNotaFiscalOverlay');
  const id = overlay.dataset.id || null;
  const btnSalvar = document.getElementById('btnSalvarNotaFiscal');

  const clienteId = document.getElementById('nfClienteId').value || null;
  const clienteNomeManual = document.getElementById('nfClienteNome').value.trim().toUpperCase();
  const clienteExistente = clienteId ? state.clientes.find(c => c.id === clienteId) : null;
  const clienteNome = clienteExistente ? clienteExistente.nome : (clienteNomeManual || null);

  const dataNota = document.getElementById('nfData').value;
  const valor = parseMoedaBR(document.getElementById('nfValor').value);
  const descricao = document.getElementById('nfDescricao').value.trim();
  const observacoes = document.getElementById('nfObservacoes').value.trim();

  if (!dataNota || !valor) {
    toast('Preencha data e valor.', 'error');
    return;
  }

  if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.textContent = 'Salvando...'; }

  const nfObj = {
    id: id || uid(),
    clienteId,
    clienteNome,
    dataNota,
    valor,
    descricao,
    observacoes,
    arquivoUrl: id ? (state.notasFiscais.find(x => x.id === id)?.arquivoUrl || null) : null,
    criadoEm: id ? undefined : new Date().toISOString(),
  };

  // Upload de PDF se selecionado
  const fileInput = document.getElementById('nfArquivo');
  if (fileInput?.files?.length) {
    const file = fileInput.files[0];
    const filePath = `${state.empresaId}/${nfObj.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('notas-fiscais')
      .upload(filePath, file, { upsert: true });
    if (uploadError) {
      console.error('Erro upload NF:', uploadError);
      toast('Erro ao enviar arquivo: ' + uploadError.message, 'error');
      if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.textContent = 'Salvar'; }
      return;
    }
    const { data: urlData } = supabaseClient.storage.from('notas-fiscais').getPublicUrl(uploadData.path);
    nfObj.arquivoUrl = urlData.publicUrl;
  }

  const dados = notaFiscalParaDb(nfObj);

  if (id) {
    const { error } = await supabaseClient.from('notas_fiscais').update(dados).eq('id', id);
    if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.textContent = 'Salvar'; }
    if (error) { console.error(error); toast('Erro ao atualizar nota fiscal', 'error'); return; }
    const idx = state.notasFiscais.findIndex(x => x.id === id);
    if (idx !== -1) state.notasFiscais[idx] = nfObj;
    toast('Nota fiscal atualizada!', 'success');
  } else {
    const { error } = await supabaseClient.from('notas_fiscais').insert([dados]);
    if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.textContent = 'Salvar'; }
    if (error) { console.error(error); toast('Erro ao cadastrar nota fiscal', 'error'); return; }
    state.notasFiscais.unshift(nfObj);
    toast('Nota fiscal cadastrada!', 'success');
  }

  fecharModalNotaFiscalForce();
  renderNotasFiscais();
}

async function excluirNotaFiscal(id) {
  const nf = state.notasFiscais.find(x => x.id === id);
  if (!nf) return;
  if (!confirm(`Excluir nota fiscal${nf.clienteNome ? ' de ' + nf.clienteNome : ''}?`)) return;
  state.notasFiscais = state.notasFiscais.filter(x => x.id !== id);
  supabaseClient.from('notas_fiscais').delete().eq('id', id).then(({ error }) => {
    if (error) console.error('Erro ao excluir nota fiscal:', error);
  });
  renderNotasFiscais();
  toast('Nota fiscal excluída');
}

// ===== INIT =====
function init() {
  configurarCamposMoeda();

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
}

document.addEventListener('DOMContentLoaded', init);

import { randomUUID } from 'node:crypto';

// Arrays usados como banco de dados em memória.
const clientes = [];
const categorias = [];
const fornecedores = [];
const produtos = [];

function responderJson(response, status, dados) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(dados));
}

function ehObjeto(valor) {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

function textoObrigatorio(valor) {
  return typeof valor === 'string' && valor.trim().length > 0;
}

// Cria as rotas GET, POST, PUT e DELETE para cada array.
function criarRotasCrud({ caminho, lista, validar, preparar, antesDeExcluir }) {
  return (request, response, pathname) => {
    if (pathname !== caminho && !pathname.startsWith(`${caminho}/`)) {
      return false;
    }

    const sufixo = pathname.slice(caminho.length);
    const id = sufixo ? sufixo.slice(1) : null;

    // GET /recurso — lista todos os registros.
    if (id === null && request.method === 'GET') {
      responderJson(response, 200, lista);
      return true;
    }

    // POST /recurso — valida e cadastra um registro.
    if (id === null && request.method === 'POST') {
      if (!ehObjeto(request.body)) {
        responderJson(response, 400, {
          erro: 'Envie um objeto JSON no corpo da requisição.',
        });
        return true;
      }

      const problema = validar(request.body, null);

      if (problema) {
        responderJson(response, problema.status, { erro: problema.mensagem });
        return true;
      }

      const registro = {
        id: randomUUID(),
        ...preparar(request.body),
      };

      lista.push(registro);
      responderJson(response, 201, registro);
      return true;
    }

    // As outras operações usam um ID: /recurso/:id
    if (id === null || id.length === 0 || id.includes('/')) {
      responderJson(response, 404, { erro: 'Rota não encontrada.' });
      return true;
    }

    const indice = lista.findIndex((registro) => registro.id === id);

    if (indice === -1) {
      responderJson(response, 404, { erro: 'Registro não encontrado.' });
      return true;
    }

    const registro = lista[indice];

    // GET /recurso/:id — busca um registro.
    if (request.method === 'GET') {
      responderJson(response, 200, registro);
      return true;
    }

    // PUT /recurso/:id — atualiza os campos enviados.
    if (request.method === 'PUT') {
      if (!ehObjeto(request.body)) {
        responderJson(response, 400, {
          erro: 'Envie um objeto JSON no corpo da requisição.',
        });
        return true;
      }

      const atualizado = {
        ...registro,
        ...request.body,
        id: registro.id,
      };

      const problema = validar(atualizado, registro.id);

      if (problema) {
        responderJson(response, problema.status, { erro: problema.mensagem });
        return true;
      }

      Object.assign(registro, preparar(atualizado), { id: registro.id });
      responderJson(response, 200, registro);
      return true;
    }

    // DELETE /recurso/:id — remove um registro.
    if (request.method === 'DELETE') {
      const problema = antesDeExcluir ? antesDeExcluir(registro) : null;

      if (problema) {
        responderJson(response, problema.status, { erro: problema.mensagem });
        return true;
      }

      lista.splice(indice, 1);
      response.writeHead(204);
      response.end();
      return true;
    }

    responderJson(response, 405, { erro: 'Método não permitido para esta rota.' });
    return true;
  };
}

const rotas = [
  criarRotasCrud({
    caminho: '/clientes',
    lista: clientes,

    validar: (cliente, idAtual) => {
      if (!textoObrigatorio(cliente.nome)) {
        return { status: 400, mensagem: 'O campo nome é obrigatório.' };
      }

      if (
        !textoObrigatorio(cliente.email) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.email.trim())
      ) {
        return { status: 400, mensagem: 'Informe um email válido.' };
      }

      if (cliente.telefone !== undefined && typeof cliente.telefone !== 'string') {
        return { status: 400, mensagem: 'O campo telefone deve ser um texto.' };
      }

      if (cliente.ativo !== undefined && typeof cliente.ativo !== 'boolean') {
        return { status: 400, mensagem: 'O campo ativo deve ser true ou false.' };
      }

      const email = cliente.email.trim().toLowerCase();

      // .some() verifica se o email já está cadastrado.
      const emailDuplicado = clientes.some(
        (existente) =>
          existente.email === email && existente.id !== idAtual,
      );

      if (emailDuplicado) {
        return {
          status: 409,
          mensagem: 'Já existe um cliente cadastrado com esse email.',
        };
      }

      return null;
    },

    preparar: (cliente) => ({
      nome: cliente.nome.trim(),
      email: cliente.email.trim().toLowerCase(),
      telefone: cliente.telefone ? cliente.telefone.trim() : '',
      ativo: cliente.ativo === undefined ? true : cliente.ativo,
    }),
  }),

  criarRotasCrud({
    caminho: '/categorias',
    lista: categorias,

    validar: (categoria) => {
      if (!textoObrigatorio(categoria.nome)) {
        return { status: 400, mensagem: 'O campo nome é obrigatório.' };
      }

      if (
        categoria.descricao !== undefined &&
        typeof categoria.descricao !== 'string'
      ) {
        return { status: 400, mensagem: 'O campo descricao deve ser um texto.' };
      }

      return null;
    },

    preparar: (categoria) => ({
      nome: categoria.nome.trim(),
      descricao: categoria.descricao ? categoria.descricao.trim() : '',
    }),

    antesDeExcluir: (categoria) => {
      const categoriaEmUso = produtos.some(
        (produto) => produto.categoriaId === categoria.id,
      );

      if (categoriaEmUso) {
        return {
          status: 409,
          mensagem: 'Não é possível excluir uma categoria que possui produtos.',
        };
      }

      return null;
    },
  }),

  criarRotasCrud({
    caminho: '/fornecedores',
    lista: fornecedores,

    validar: (fornecedor) => {
      if (!textoObrigatorio(fornecedor.razaoSocial)) {
        return { status: 400, mensagem: 'O campo razaoSocial é obrigatório.' };
      }

      if (
        typeof fornecedor.cnpj !== 'string' ||
        !/^\d{14}$/.test(fornecedor.cnpj.trim())
      ) {
        return {
          status: 400,
          mensagem: 'O CNPJ deve conter exatamente 14 números.',
        };
      }

      if (
        fornecedor.contato !== undefined &&
        typeof fornecedor.contato !== 'string'
      ) {
        return { status: 400, mensagem: 'O campo contato deve ser um texto.' };
      }

      return null;
    },

    preparar: (fornecedor) => ({
      razaoSocial: fornecedor.razaoSocial.trim(),
      cnpj: fornecedor.cnpj.trim(),
      contato: fornecedor.contato ? fornecedor.contato.trim() : '',
    }),
  }),

  criarRotasCrud({
    caminho: '/produtos',
    lista: produtos,

    validar: (produto) => {
      if (!textoObrigatorio(produto.nome)) {
        return { status: 400, mensagem: 'O campo nome é obrigatório.' };
      }

      if (
        typeof produto.preco !== 'number' ||
        !Number.isFinite(produto.preco) ||
        produto.preco < 0
      ) {
        return {
          status: 400,
          mensagem: 'O preço deve ser um número maior ou igual a zero.',
        };
      }

      if (
        typeof produto.categoriaId !== 'string' ||
        produto.categoriaId.length === 0
      ) {
        return { status: 400, mensagem: 'Informe o id da categoria do produto.' };
      }

      // A categoria precisa existir no array de categorias.
      const categoriaExiste = categorias.some(
        (categoria) => categoria.id === produto.categoriaId,
      );

      if (!categoriaExiste) {
        return { status: 400, mensagem: 'A categoria informada não existe.' };
      }

      return null;
    },

    preparar: (produto) => ({
      nome: produto.nome.trim(),
      preco: produto.preco,
      categoriaId: produto.categoriaId,
    }),
  }),
];

// O server.js original importa e chama esta função.
export const manipuladorDeRotas = (request, response) => {
  const pathname =
    new URL(request.url, 'http://localhost').pathname.replace(/\/+$/, '') || '/';

  for (const tratarRota of rotas) {
    if (tratarRota(request, response, pathname)) {
      return;
    }
  }

  responderJson(response, 404, { erro: 'Rota ou método não encontrado.' });
};
import { randomUUID } from 'node:crypto';
import { db } from './database.js';

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

// Registra GET, POST, PUT e DELETE para uma tabela SQLite.
function criarRotasCrud({
  caminho,
  tabela,
  colunas,
  validar,
  preparar,
  formatar = (registro) => registro,
  antesDeExcluir,
}) {
  return async (request, response, pathname) => {
    if (pathname !== caminho && !pathname.startsWith(`${caminho}/`)) {
      return false;
    }

    const sufixo = pathname.slice(caminho.length);
    const id = sufixo ? sufixo.slice(1) : null;

    // GET /recurso — lista todos.
    if (id === null && request.method === 'GET') {
      const registros = await db.all(`SELECT * FROM ${tabela}`);
      responderJson(response, 200, registros.map(formatar));
      return true;
    }

    // POST /recurso — valida e cadastra.
    if (id === null && request.method === 'POST') {
      if (!ehObjeto(request.body)) {
        responderJson(response, 400, {
          erro: 'Envie um objeto JSON no corpo da requisição.',
        });
        return true;
      }

      const problema = await validar(request.body, null);

      if (problema) {
        responderJson(response, problema.status, { erro: problema.mensagem });
        return true;
      }

      const novoId = randomUUID();
      const valores = preparar(request.body);
      const marcadores = ['?', ...colunas.map(() => '?')].join(', ');
      const sql = `
        INSERT INTO ${tabela} (id, ${colunas.join(', ')})
        VALUES (${marcadores})
      `;
      const parametros = [
        novoId,
        ...colunas.map((coluna) => valores[coluna]),
      ];

      await db.run(sql, parametros);

      const registro = await db.get(
        `SELECT * FROM ${tabela} WHERE id = ?`,
        [novoId],
      );

      responderJson(response, 201, formatar(registro));
      return true;
    }

    // GET, PUT e DELETE de um registro usam /recurso/:id.
    if (id === null || id.length === 0 || id.includes('/')) {
      responderJson(response, 404, { erro: 'Rota não encontrada.' });
      return true;
    }

    const linha = await db.get(
      `SELECT * FROM ${tabela} WHERE id = ?`,
      [id],
    );

    if (!linha) {
      responderJson(response, 404, { erro: 'Registro não encontrado.' });
      return true;
    }

    const registro = formatar(linha);

    // GET /recurso/:id — consulta um registro.
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

      const problema = await validar(atualizado, registro.id);

      if (problema) {
        responderJson(response, problema.status, { erro: problema.mensagem });
        return true;
      }

      const valores = preparar(atualizado);
      const atribuicoes = colunas
        .map((coluna) => `${coluna} = ?`)
        .join(', ');
      const parametros = [
        ...colunas.map((coluna) => valores[coluna]),
        registro.id,
      ];

      await db.run(
        `UPDATE ${tabela} SET ${atribuicoes} WHERE id = ?`,
        parametros,
      );

      const registroAtualizado = await db.get(
        `SELECT * FROM ${tabela} WHERE id = ?`,
        [registro.id],
      );

      responderJson(response, 200, formatar(registroAtualizado));
      return true;
    }

    // DELETE /recurso/:id — remove um registro.
    if (request.method === 'DELETE') {
      const problema = antesDeExcluir
        ? await antesDeExcluir(registro)
        : null;

      if (problema) {
        responderJson(response, problema.status, { erro: problema.mensagem });
        return true;
      }

      await db.run(`DELETE FROM ${tabela} WHERE id = ?`, [registro.id]);
      response.writeHead(204);
      response.end();
      return true;
    }

    responderJson(response, 405, {
      erro: 'Método não permitido para esta rota.',
    });
    return true;
  };
}

const rotas = [
  criarRotasCrud({
    caminho: '/clientes',
    tabela: 'clientes',
    colunas: ['nome', 'email', 'telefone', 'ativo'],

    validar: async (cliente, idAtual) => {
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
      let existente;

      if (idAtual === null) {
        existente = await db.get(
          'SELECT id FROM clientes WHERE email = ? LIMIT 1',
          [email],
        );
      } else {
        existente = await db.get(
          'SELECT id FROM clientes WHERE email = ? AND id <> ? LIMIT 1',
          [email, idAtual],
        );
      }

      if (existente) {
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
      ativo: cliente.ativo === undefined ? 1 : Number(cliente.ativo),
    }),

    formatar: (cliente) => ({
      ...cliente,
      ativo: Boolean(cliente.ativo),
    }),
  }),

  criarRotasCrud({
    caminho: '/categorias',
    tabela: 'categorias',
    colunas: ['nome', 'descricao'],

    validar: async (categoria) => {
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

    antesDeExcluir: async (categoria) => {
      const produto = await db.get(
        'SELECT id FROM produtos WHERE categoriaId = ? LIMIT 1',
        [categoria.id],
      );

      if (produto) {
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
    tabela: 'fornecedores',
    colunas: ['razaoSocial', 'cnpj', 'contato'],

    validar: async (fornecedor) => {
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
    tabela: 'produtos',
    colunas: ['nome', 'preco', 'categoriaId'],

    validar: async (produto) => {
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
        return { status: 400, mensagem: 'Informe o id da categoria.' };
      }

      const categoria = await db.get(
        'SELECT id FROM categorias WHERE id = ?',
        [produto.categoriaId],
      );

      if (!categoria) {
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

export async function manipuladorDeRotas(request, response) {
  try {
    const pathname =
      new URL(request.url, 'http://localhost').pathname.replace(/\/+$/, '') || '/';

    for (const tratarRota of rotas) {
      if (await tratarRota(request, response, pathname)) {
        return;
      }
    }

    responderJson(response, 404, { erro: 'Rota ou método não encontrado.' });
  } catch (erro) {
    console.error('Erro ao acessar o SQLite:', erro);

    if (!response.headersSent) {
      responderJson(response, 500, {
        erro: 'Erro interno ao acessar o banco de dados.',
      });
    }
  }
}
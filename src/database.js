import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { fileURLToPath } from 'node:url';

const caminhoBanco = fileURLToPath(
  new URL('../database.sqlite', import.meta.url),
);

export const db = await open({
  filename: caminhoBanco,
  driver: sqlite3.Database,
});

await db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS clientes (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    telefone TEXT NOT NULL DEFAULT '',
    ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1))
  );

  CREATE TABLE IF NOT EXISTS categorias (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    descricao TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS fornecedores (
    id TEXT PRIMARY KEY,
    razaoSocial TEXT NOT NULL,
    cnpj TEXT NOT NULL CHECK (length(cnpj) = 14),
    contato TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS produtos (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    preco REAL NOT NULL CHECK (preco >= 0),
    categoriaId TEXT NOT NULL,
    FOREIGN KEY (categoriaId) REFERENCES categorias(id) ON DELETE RESTRICT
  );
`);

console.log('Banco SQLite conectado e tabelas verificadas.');
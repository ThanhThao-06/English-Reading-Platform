import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openLibraryDatabase } from './database.mjs';
import { loadSourcePolicies } from './import-packages.mjs';
import { LibraryRepository } from './library-repository.mjs';

const sendJson = (response, status, value) => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(value));
};

export const createLibraryServer = (repository) => createServer((request, response) => {
  let url;
  try {
    url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  } catch {
    sendJson(response, 400, { error: 'Invalid request URL.' });
    return;
  }

  if (request.method !== 'GET') {
    response.setHeader('allow', 'GET');
    sendJson(response, 405, { error: 'Only GET requests are supported.' });
    return;
  }

  if (url.pathname === '/api/health') {
    try {
      sendJson(response, 200, { status: 'ok', importedArticles: repository.getArticleCount() });
    } catch (error) {
      console.error('Library health check failed:', error);
      sendJson(response, 500, { error: 'Library storage is temporarily unavailable.' });
    }
    return;
  }

  if (url.pathname === '/api/library/articles') {
    try {
      sendJson(response, 200, { articles: repository.listArticles() });
    } catch (error) {
      console.error('Library article list failed:', error);
      sendJson(response, 500, { error: 'Imported Library content is temporarily unavailable.' });
    }
    return;
  }

  const articleMatch = url.pathname.match(/^\/api\/library\/articles\/([^/]+)$/);
  if (articleMatch) {
    let id;
    try {
      id = decodeURIComponent(articleMatch[1]);
    } catch {
      sendJson(response, 400, { error: 'Article ID is malformed.' });
      return;
    }
    try {
      const article = repository.getArticle(id);
      if (!article) {
        sendJson(response, 404, { error: 'Imported article not found.' });
        return;
      }
      sendJson(response, 200, article);
    } catch (error) {
      console.error(`Imported article read failed for ${id}:`, error);
      sendJson(response, 500, { error: 'Imported article is temporarily unavailable.' });
    }
    return;
  }

  if (url.pathname === '/api/library/import-runs') {
    const limit = url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : 50;
    try {
      sendJson(response, 200, { runs: repository.listImportRuns(limit) });
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  sendJson(response, 404, { error: 'API route not found.' });
});

export const startLibraryServer = (port = Number(process.env.PORT ?? 4174)) => {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RangeError('PORT must be an integer between 1 and 65535.');
  }
  const database = openLibraryDatabase();
  try {
    const repository = new LibraryRepository(database, loadSourcePolicies());
    const server = createLibraryServer(repository);
    server.listen(port, () => console.log(`Library API listening on http://localhost:${port}`));
    const shutdown = () => {
      server.close((error) => {
        if (error) {
          console.error('Library API shutdown failed:', error);
          process.exitCode = 1;
        }
        database.close();
      });
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    return server;
  } catch (error) {
    database.close();
    throw error;
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    startLibraryServer();
  } catch (error) {
    console.error(`Library API failed to start: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

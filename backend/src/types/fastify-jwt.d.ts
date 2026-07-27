import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: number; username: string; role: 'admin' | 'viewer' };
    user: { sub: number; username: string; role: 'admin' | 'viewer' };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
    blockWriteForViewer: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }
}

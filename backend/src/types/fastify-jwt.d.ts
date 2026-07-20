import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: number; username: string };
    user: { sub: number; username: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<void>;
  }
}

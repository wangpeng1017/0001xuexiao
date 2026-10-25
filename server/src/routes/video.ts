import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { geoTools } from '../lib/geo-tools.js';
import { ok } from '../lib/resp.js';
import { parseInput } from '../lib/validate.js';
import { registerVideoStream, VideoStreamManager } from '../services/video.js';
import { ALL_ROLES } from '../types.js';

const registerSchema = z.object({
  rtspUrl: z
    .string({ required_error: 'rtspUrl 不能为空' })
    .trim()
    .min(1, 'rtspUrl 不能为空')
    .max(2048, 'rtspUrl 不能超过 2048 个字符')
});

const streamParamsSchema = z.object({
  streamId: z.string().min(1)
});

const videoRoutes: FastifyPluginAsync = async (fastify) => {
  const manager = new VideoStreamManager(geoTools);
  fastify.addHook('onClose', async () => {
    manager.shutdown();
  });

  fastify.post('/video/register', { config: { auth: ALL_ROLES } }, async (request) => {
    const input = parseInput(registerSchema, request.body);
    const result = await registerVideoStream(
      fastify.prisma,
      request.currentUser!.id,
      input.rtspUrl
    );
    return ok(result);
  });

  fastify.get(
    '/open/video/:streamId.flv',
    { config: { auth: 'public' } },
    async (request, reply) => {
      const params = parseInput(streamParamsSchema, request.params);
      const stream = await fastify.prisma.videoStream.findUnique({
        where: { id: params.streamId }
      });
      if (!stream) {
        return reply.status(404).type('text/plain; charset=utf-8').send('视频流不存在');
      }

      const session = manager.attach(stream.id, stream.url);
      request.raw.on('close', session.detach);
      try {
        await session.ready;
      } catch (error) {
        session.detach();
        const message = error instanceof Error ? error.message : String(error);
        return reply.status(502).type('text/plain; charset=utf-8').send(message);
      }

      if (reply.raw.destroyed || reply.raw.writableEnded) {
        session.detach();
        return;
      }
      reply.hijack();
      session.bind(reply.raw);
    }
  );
};

export default videoRoutes;

import type { PresenceDTO } from '#shared/types'

/**
 * POST /api/rooms/:code/presence — heartbeat.
 *
 * Clients ping every 20 seconds; the response carries the fresh member list so
 * presence costs exactly one request per interval.
 */
export default defineEventHandler(async (event): Promise<PresenceDTO> => {
  const { room, guest } = await useRoomContext(event)

  await touchPresence(room.id, guest!.id)
  const members = await listMembers(room, guest!.id)

  return { members, onlineCount: members.filter(member => member.online).length }
})

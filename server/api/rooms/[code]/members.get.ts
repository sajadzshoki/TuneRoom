import type { PresenceDTO } from '#shared/types'

/** GET /api/rooms/:code/members — who is in the room right now. */
export default defineEventHandler(async (event): Promise<PresenceDTO> => {
  const { room, guest } = await useRoomContext(event)
  const members = await listMembers(room, guest?.id)
  return { members, onlineCount: members.filter(member => member.online).length }
})

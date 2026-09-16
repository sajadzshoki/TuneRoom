import QRCode from 'qrcode'

/**
 * GET /api/rooms/:code/qr — SVG QR code for the share sheet.
 * Rendered server side so the client needs no QR dependency.
 */
export default defineEventHandler(async (event) => {
  const room = await requireRoom(roomRefFromEvent(event))
  const shareUrl = `${appOrigin(event)}/room/${room.slug}`

  const svg = await QRCode.toString(shareUrl, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#EDEDF0FF', light: '#00000000' },
  })

  setHeader(event, 'content-type', 'image/svg+xml; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return svg
})

import { jsPDF } from 'jspdf'
import { db, jpegBlob } from '../db'
import { PAGE_MARGIN_MM, type BookFormat, type BookPage } from './book'
import { coverCrop } from './images'

export const CAPTION_MM = 9
const DPI = 300
const MAX_PX = 3000

// The built-in PDF fonts only cover Latin-1 (åäö is fine, emoji are not).
const latin1 = (s: string) => s.replace(/[^ -ÿ]/g, '').trim()

async function placePhoto(pdf: jsPDF, photoId: string, x: number, y: number, w: number, h: number) {
  const image = await db.images.get(photoId)
  if (!image) return
  const maxEdge = Math.min(MAX_PX, Math.round((Math.max(w, h) / 25.4) * DPI))
  const jpeg = await coverCrop(jpegBlob(image.data), w / h, maxEdge)
  pdf.addImage(jpeg, 'JPEG', x, y, w, h, undefined, 'NONE')
}

/** Renders the laid-out book to a print-ready PDF (one PDF page per book page). */
export async function renderBookPdf(pages: BookPage[], format: BookFormat, onProgress: (done: number) => void) {
  const { widthMm: W, heightMm: H } = format
  const pdf = new jsPDF({ unit: 'mm', format: [W, H], orientation: W > H ? 'landscape' : 'portrait', compress: true })
  const m = PAGE_MARGIN_MM
  const cw = W - 2 * m
  const ch = H - 2 * m

  for (const [index, page] of pages.entries()) {
    if (index > 0) pdf.addPage([W, H], W > H ? 'landscape' : 'portrait')
    pdf.setTextColor(43, 38, 34)

    if (page.kind === 'cover') {
      const photoH = ch * 0.72
      if (page.photoId) await placePhoto(pdf, page.photoId, m, m, cw, photoH)
      pdf.setFont('times', 'normal')
      pdf.setFontSize(28)
      pdf.text(latin1(page.title), W / 2, m + photoH + (ch - photoH) * 0.5, { align: 'center' })
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(11)
      pdf.setTextColor(138, 128, 121)
      pdf.text(latin1(page.subtitle), W / 2, m + photoH + (ch - photoH) * 0.5 + 9, { align: 'center' })
    } else {
      for (const item of page.items) {
        const x = m + item.slot.x * cw
        const y = m + item.slot.y * ch
        const w = item.slot.w * cw
        let h = item.slot.h * ch
        const caption = item.caption ? latin1(item.caption) : ''
        if (caption) h -= CAPTION_MM
        await placePhoto(pdf, item.photoId, x, y, w, h)
        if (caption) {
          pdf.setFont('helvetica', 'italic')
          pdf.setFontSize(10)
          pdf.setTextColor(90, 82, 76)
          const lines = pdf.splitTextToSize(caption, w).slice(0, 1)
          pdf.text(lines, x + w / 2, y + h + 6, { align: 'center' })
        }
      }
    }
    onProgress(index + 1)
  }
  return pdf.output('blob')
}

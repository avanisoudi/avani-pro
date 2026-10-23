import { requireSupabase } from './supabase'
export const MARKET_CATEGORIES = ['Autres', 'Électronique', 'Maison', 'Vêtements', 'Véhicules', 'Loisirs', 'Matériel professionnel'] as const
export type Listing = {
  id: string; seller_id: string; title: string; description: string | null; price: number | null;
  currency: string; condition: string | null; category: string; location: string | null;
  status: 'active' | 'sold' | 'removed'; created_at: string; photo_path: string | null;
  photo_url?: string; seller?: { id: string; full_name: string; username: string } | null
}
export type ListingInput = { title: string; description: string; price: string; currency: string; condition: string; category: string; location: string }
const BUCKET = 'marketplace-photos'
export function listingPayload(input: ListingInput) {
  const title = input.title.trim(), description = input.description.trim(), location = input.location.trim()
  const priceText = input.price.trim().replace(',', '.')
  const price = Number(priceText)
  if (title.length < 2 || title.length > 160) throw new Error('Le titre doit contenir entre 2 et 160 caractères.')
  if (description.length > 3000 || location.length > 120) throw new Error('Description : 3 000 caractères maximum ; ville : 120.')
  if (!priceText || !/^\d+(\.\d{1,2})?$/.test(priceText) || !Number.isFinite(price) || price > 999999999) throw new Error('Indiquez un prix positif, avec deux décimales maximum (0 pour un don).')
  if (!['EUR','XAF','USD'].includes(input.currency)) throw new Error('Devise invalide.')
  if (!['Neuf', 'Comme neuf', 'Bon état', 'À rénover'].includes(input.condition)) throw new Error('Choisissez l’état de l’article.')
  if (!(MARKET_CATEGORIES as readonly string[]).includes(input.category)) throw new Error('Catégorie invalide.')
  if (!location) throw new Error('Indiquez une ville, sans adresse précise.')
  return { title, description, price, currency: input.currency, condition: input.condition, category: input.category, location }
}
export function validateListingPhoto(file: File) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) throw new Error('Choisissez une photo JPEG, PNG ou WebP de 5 Mo maximum.')
}
export function formatListingPrice(price: number | null, currency: string) {
  if (price === null) return 'Prix à convenir'
  if (Number(price) === 0) return 'Gratuit'
  try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(Number(price)) } catch { return `${price} ${currency}` }
}
function marketError(error: { code?: string; message: string }) {
  return new Error(['42P01','42703','PGRST200','PGRST204','PGRST205'].includes(error.code ?? '')
    ? 'La Marketplace nécessite la migration 020_marketplace.sql. Aucune annonce ne peut être chargée pour le moment.' : error.message)
}
const columns = 'id,seller_id,title,description,price,currency,condition,category,location,status,created_at,photo_path,seller:profiles!marketplace_listings_seller_id_fkey(id,full_name,username)'
export async function fetchListings(options: { mine: boolean; userId: string; query: string; category: string; city: string; offset: number }) {
  let request = requireSupabase().from('marketplace_listings').select(columns)
    .order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(options.offset, options.offset + 23)
  request = options.mine ? request.eq('seller_id', options.userId).neq('status', 'removed') : request.eq('status', 'active')
  const clean = (value: string) => value.replace(/[,%_().\\"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)
  const term = clean(options.query), city = clean(options.city)
  if (term) request = request.or(`title.ilike.%${term}%,description.ilike.%${term}%`)
  if (city) request = request.ilike('location', `%${city}%`)
  if (options.category) request = request.eq('category', options.category)
  const { data, error } = await request
  if (error) throw marketError(error)
  const rows = (data ?? []).map(row => ({ ...row, seller: Array.isArray(row.seller) ? row.seller[0] : row.seller })) as Listing[]
  const paths = rows.flatMap(row => row.photo_path ? [row.photo_path] : [])
  if (!paths.length) return rows
  const result = await requireSupabase().storage.from(BUCKET).createSignedUrls(paths, 3600)
  const urls = new Map((result.data ?? []).map(item => [item.path, item.signedUrl]))
  return rows.map(row => ({ ...row, photo_url: row.photo_path ? urls.get(row.photo_path) ?? undefined : undefined }))
}
export async function publishListing(userId: string, input: ListingInput, photo: File) {
  const payload = listingPayload(input)
  validateListingPhoto(photo)
  const client = requireSupabase(), id = crypto.randomUUID()
  const ext = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${userId}/${id}/photo.${ext}`
  const upload = await client.storage.from(BUCKET).upload(path, photo, { upsert: false, contentType: photo.type })
  if (upload.error) throw new Error(`Photo non envoyée : ${upload.error.message}`)
  const { error } = await client.from('marketplace_listings').insert({ ...payload, id, seller_id: userId, photo_path: path, status: 'active' })
  if (error) {
    // Definite rejection: remove only the new object, never an existing listing's photo.
    // A network error can be ambiguous (the INSERT may have committed), so retain it.
    if (error.code && error.code !== 'PGRST000') await client.storage.from(BUCKET).remove([path])
    throw marketError(error)
  }
  return id
}
export async function setListingStatus(id: string, userId: string, status: 'active' | 'sold' | 'removed') {
  const { data, error } = await requireSupabase().from('marketplace_listings').update({ status, updated_at: new Date().toISOString() })
    .eq('id', id).eq('seller_id', userId).select('id').single()
  if (error) throw marketError(error)
  if (!data) throw new Error('Annonce introuvable ou modification non autorisée.')
}

import type { StructuredBusiness } from "@/features/business-discovery"

export type OnlinePresenceType = "Website" | "SocialProfile" | "Directory"
export type AssociationState = "Confirmed" | "Ambiguous"
export type ContactRouteType =
  | "GenericEmail"
  | "BusinessTelephone"
  | "ContactForm"
  | "SocialMessaging"

export type OnlinePresence = Readonly<{
  type: OnlinePresenceType
  url: string
  sourceIdentifier: string
  associationState: AssociationState
  collectedAt: Date
}>

export type ContactRoute = Readonly<{
  type: ContactRouteType
  value: string
  sourceUrl: string
  collectedAt: Date
}>

export type IdentityInput = Readonly<{
  business: StructuredBusiness
  countryCode: string
  collectedAt: Date
}>

export type IdentityEvaluation = Readonly<{
  status: "Eligible" | "Ambiguous" | "Excluded"
  canonicalFingerprint?: string
  canonicalName: string
  decisionScope: "Local" | "Ambiguous" | "Central"
  signals: readonly string[]
  presences: readonly OnlinePresence[]
  contacts: readonly ContactRoute[]
  exclusionCode?:
    | "identity-ambiguous"
    | "national-chain"
    | "central-franchise"
    | "online-only"
    | "missing-contact"
  exclusionReason?: string
}>

// Keep eligibility and canonical identity deterministic after runtime-assisted structuring.
export function evaluateBusinessIdentity(input: IdentityInput): IdentityEvaluation {
  const { business } = input
  const canonicalName = business.name.trim().slice(0, 300)
  const locality = normalizeWords(business.locality)
  const ambiguous = business.decisionScope === "Ambiguous"
  const presences: readonly OnlinePresence[] = business.presences.map((presence) => ({
    type: presence.type,
    url: presence.url,
    sourceIdentifier: presence.url,
    associationState: ambiguous ? "Ambiguous" : "Confirmed",
    collectedAt: input.collectedAt,
  }))
  const contacts: readonly ContactRoute[] = business.contacts.map((contact) => ({
    type: contact.type,
    value: contact.value,
    sourceUrl: contact.sourceUrl,
    collectedAt: input.collectedAt,
  }))
  const signals = [
    "StructuredAttribution",
    ...(business.sourceUrls.length >= 2 ? ["RepeatedPublicPresence"] : []),
    ...(business.websiteUrl ? ["WebsiteConfirmed"] : []),
    ...(contacts.some((contact) => contact.type === "BusinessTelephone") ? ["TelephoneMatch"] : []),
    ...(locality.length >= 3 ? ["SearchAreaMatch"] : []),
  ]
  const canonicalFingerprint = fingerprint(
    canonicalName,
    locality,
    input.countryCode,
    contacts,
    business.websiteUrl,
  )
  const base = { canonicalName, signals, presences, contacts } as const

  if (ambiguous) {
    return {
      ...base,
      contacts: [],
      status: "Ambiguous",
      decisionScope: "Ambiguous",
      exclusionCode: "identity-ambiguous",
      exclusionReason:
        "The report did not say clearly enough that these details are this business.",
    }
  }
  if (business.centrallyControlled || business.decisionScope === "Central") {
    return {
      ...base,
      status: "Excluded",
      decisionScope: "Central",
      canonicalFingerprint,
      exclusionCode: "national-chain",
      exclusionReason: "Public evidence identifies a centrally controlled chain or franchise.",
    }
  }
  if (business.onlineOnly) {
    return {
      ...base,
      status: "Excluded",
      decisionScope: "Central",
      canonicalFingerprint,
      exclusionCode: "online-only",
      exclusionReason: "Public evidence indicates an online-only business with no local decision.",
    }
  }
  if (contacts.length === 0) {
    return {
      ...base,
      status: "Excluded",
      decisionScope: "Local",
      canonicalFingerprint,
      exclusionCode: "missing-contact",
      exclusionReason:
        "No public business Contact Route was reported or confirmed for this business.",
    }
  }

  return { ...base, status: "Eligible", decisionScope: "Local", canonicalFingerprint }
}

// Stable public routes outrank names: same-name neighbours must never share candidate state.
function fingerprint(
  canonicalName: string,
  locality: string,
  countryCode: string,
  contacts: readonly ContactRoute[],
  websiteUrl?: string,
): string {
  const country = countryCode.toUpperCase()
  const telephone = contacts.find((contact) => contact.type === "BusinessTelephone")?.value
  const dialled = telephone ? normalizeTelephone(telephone) : ""
  if (dialled) return `tel:${dialled}|${country}`
  const host = websiteUrl ? websiteHost(websiteUrl) : undefined
  if (host) return `web:${host}|${country}`
  const contact = contacts
    .filter((route) => route.type !== "BusinessTelephone")
    .map((route) => ({ type: route.type, value: normalizeContactValue(route) }))
    .filter((route) => route.value.length > 0)
    .sort((left, right) =>
      `${left.type}:${left.value}`.localeCompare(`${right.type}:${right.value}`, "en"),
    )[0]
  if (contact) return `contact:${contact.type}:${contact.value}|${country}`
  return `name:${normalizeWords(canonicalName)}|${locality}|${country}`
}

// A business is one business however it was written down, so it is found by any route it carries.
export function routeMatchKey(
  route: Readonly<{ type: string; value: string }>,
): string | undefined {
  if (route.type === "BusinessTelephone") {
    const subscriber = telephoneSubscriberNumber(route.value)
    return subscriber ? `tel:${subscriber}` : undefined
  }
  if (route.type === "GenericEmail") {
    const address = route.value.trim().toLocaleLowerCase("en")
    return address ? `mail:${address}` : undefined
  }
  return undefined
}

export function websiteMatchKey(url: string): string | undefined {
  // Not the fingerprint's host, which folds punctuation away and could collide two real hosts.
  try {
    const host = new URL(url).hostname.toLocaleLowerCase("en").replace(/^www[.]/u, "")
    return host ? `web:${host}` : undefined
  } catch {
    return undefined
  }
}

// One business writes its number several ways, so the country code cannot be part of the match.
const SUBSCRIBER_DIGITS = 9

export function telephoneSubscriberNumber(value: string): string | undefined {
  const digits = normalizeTelephone(value)
  if (digits.length < SUBSCRIBER_DIGITS) return undefined
  return digits.slice(-SUBSCRIBER_DIGITS)
}
// A number is its digits: word normalising kept "tel." and "telefon", so one business became two.
export function normalizeTelephone(value: string): string {
  return value.replace(/\D/gu, "")
}

function normalizeContactValue(contact: ContactRoute): string {
  if (contact.type === "GenericEmail") return contact.value.trim().toLocaleLowerCase("en")
  try {
    const url = new URL(contact.value)
    url.hash = ""
    url.hostname = url.hostname.toLowerCase().replace(/^www\./u, "")
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/u, "")
    return url.toString()
  } catch {
    return contact.value.trim().toLocaleLowerCase("en")
  }
}

// `www.` is routing, not identity, so both spellings key the same business.
function websiteHost(url: string): string | undefined {
  try {
    return normalizeWords(new URL(url).hostname.replace(/^www\./u, ""))
  } catch {
    return undefined
  }
}

export function normalizeWords(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pl")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ")
}

/**
 * Data parsers for Swedish company information
 * Adapted from allabolag parser patterns
 */

/**
 * Parse Swedish numeric values
 * Handles: "1 000 000", "1,234.56", "25%", "-", ""
 */
export function parseValue(s: string | null | undefined): number | null {
  if (!s || s === '-' || s === '') return null;

  // Remove common formatting
  let cleaned = s
    .replace(/,/g, '.')  // Convert comma to period
    .replace(/\s/g, '')  // Remove all whitespace
    .replace(/\u00a0/g, ''); // Remove non-breaking spaces

  // Handle percentage
  if (cleaned.endsWith('%')) {
    cleaned = cleaned.replace('%', '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num / 100.0;
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Parse Swedish date formats
 */
export function parseDate(s: string | null | undefined): string | null {
  if (!s) return null;

  try {
    // Handle different date formats
    // "2023-12-31", "2023-12", "31/12/2023", etc.
    const date = new Date(s);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

/**
 * Clean text from unwanted characters and whitespace
 */
export function cleanText(text: string | null | undefined): string | null {
  if (!text) return null;

  return text
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .replace(/Läs mer/gi, '')  // Remove "Read more" links
    .trim();
}

/**
 * Parse Swedish address into components
 * Format: "Storgatan 1, 123 45 Stockholm" or "Storgatan 1, lgh 1234, 123 45 Stockholm"
 */
export function parseAddress(address: string | null | undefined): {
  street?: string;
  postal_code?: string;
  city?: string;
} {
  if (!address) return {};

  // Match postal code pattern (123 45 or 12345)
  const postalMatch = address.match(/(\d{3}\s?\d{2})\s+(.+?)$/);

  if (!postalMatch) {
    return { street: cleanText(address) || undefined };
  }

  const postal_code = postalMatch[1].replace(/\s/g, '');
  const city = postalMatch[2].trim();

  // Everything before postal code is street (minus apartment if present)
  let street = address.substring(0, address.indexOf(postalMatch[0])).trim();

  // Remove trailing comma
  if (street.endsWith(',')) {
    street = street.slice(0, -1).trim();
  }

  return {
    street: street || undefined,
    postal_code,
    city,
  };
}

/**
 * Parse apartment number from address
 * Format: "lgh 1234" or "lghnr 1234"
 */
export function parseApartment(address: string | null | undefined): string | null {
  if (!address) return null;

  const match = address.match(/lghnr?\s?(\d{4})/i);
  return match ? `lgh ${match[1]}` : null;
}

/**
 * Extract organization number from text
 * Handles: "556631-3788", "5566313788", "org.nr: 556631-3788"
 */
export function extractOrgNumber(text: string | null | undefined): string | null {
  if (!text) return null;

  const match = text.match(/(\d{6})-?(\d{4})/);
  if (!match) return null;

  return `${match[1]}-${match[2]}`;
}

/**
 * Normalize organization number to format: XXXXXX-XXXX
 */
export function normalizeOrgNumber(org_number: string): string {
  const cleaned = org_number.replace(/[^0-9]/g, '');
  if (cleaned.length !== 10) {
    throw new Error(`Invalid organization number: ${org_number}`);
  }
  return `${cleaned.slice(0, 6)}-${cleaned.slice(6)}`;
}

/**
 * Parse boolean from Swedish text
 */
export function parseBoolean(text: string | null | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  return lower === 'ja' || lower === 'yes' || lower === 'true';
}

/**
 * Parse financial amount in thousands (tkr) to SEK
 * "1 234 tkr" => 1234000
 */
export function parseThousands(text: string | null | undefined): number | null {
  if (!text) return null;

  const cleaned = text
    .replace(/\s/g, '')
    .replace(/\u00a0/g, '')
    .replace(/tkr/gi, '');

  const num = parseValue(cleaned);
  return num !== null ? num * 1000 : null;
}

/**
 * Extract age from text
 * "35 år" => 35
 */
export function parseAge(text: string | null | undefined): number | null {
  if (!text) return null;

  const match = text.match(/(\d+)\s*år/i);
  if (!match) return null;

  const age = parseInt(match[1]);
  return isNaN(age) ? null : age;
}

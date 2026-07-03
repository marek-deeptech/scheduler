const SMSAPI_ENDPOINT = 'https://api.smsapi.pl/sms.do'

function normalizePhone(phone: string): string {
  // Strip spaces and dashes
  let normalized = phone.replace(/[\s\-]/g, '')

  // If starts with +, strip the + and pass as-is
  if (normalized.startsWith('+')) {
    return normalized.slice(1)
  }

  // If bare 9-digit number, prepend Polish prefix
  if (/^\d{9}$/.test(normalized)) {
    return `48${normalized}`
  }

  return normalized
}

// SMS używają alfabetu GSM-7 / UCS-2. Znaki spoza GSM (np. en-dash „–",
// cudzysłowy typograficzne) zastępujemy bezpiecznymi odpowiednikami,
// żeby uniknąć krzaków i niepotrzebnego rozbijania na segmenty.
function sanitizeForSms(message: string): string {
  return message
    .replace(/[–—]/g, '-')   // – —  → -
    .replace(/[‘’‚]/g, "'")  // ' ' ‚ → '
    .replace(/[“”„]/g, '"')  // " " „ → "
    .replace(/…/g, '...')          // …    → ...
    .replace(/ /g, ' ')            // nbsp → spacja
    .trim()
}

// ⚠️ TRYB TESTOWY — wszystkie SMS-y przekierowane na jeden numer testowy,
// żeby nic nie trafiło do prawdziwych odbiorców. Aby wrócić do realnej
// wysyłki, ustaw TEST_REDIRECT_PHONE = '' (pusty string).
export const TEST_REDIRECT_PHONE = '608499442'

export async function sendSms(phone: string, message: string): Promise<boolean> {
  const token = process.env.SMSAPI_TOKEN
  if (!token) {
    console.error('SMSAPI_TOKEN is not set')
    return false
  }

  let targetPhone = phone
  if (TEST_REDIRECT_PHONE) {
    console.info(`[TEST] SMS przekierowany (oryg. numer: ${phone}) → ${TEST_REDIRECT_PHONE}`)
    targetPhone = TEST_REDIRECT_PHONE
  }
  const normalizedPhone = normalizePhone(targetPhone)
  const text = sanitizeForSms(message)

  // Endpoint sms.do wymaga form-urlencoded i jawnego encoding=utf-8,
  // inaczej polskie znaki przychodzą jako krzaki.
  const params = new URLSearchParams({
    to: normalizedPhone,
    message: text,
    format: 'json',
    encoding: 'utf-8',
    normalize: '0',
  })

  try {
    const res = await fetch(SMSAPI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      },
      body: params.toString(),
    })

    const body = await res.text()
    if (!res.ok || body.includes('"error"') || body.startsWith('ERROR')) {
      console.error(`SMSAPI error ${res.status}:`, body)
      return false
    }

    return true
  } catch (err) {
    console.error('SMSAPI fetch error:', err)
    return false
  }
}

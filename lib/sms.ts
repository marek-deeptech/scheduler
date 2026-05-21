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

export async function sendSms(phone: string, message: string): Promise<boolean> {
  const token = process.env.SMSAPI_TOKEN
  if (!token) {
    console.error('SMSAPI_TOKEN is not set')
    return false
  }

  const normalizedPhone = normalizePhone(phone)

  try {
    const res = await fetch(SMSAPI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: normalizedPhone, message }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`SMSAPI error ${res.status}:`, body)
      return false
    }

    return true
  } catch (err) {
    console.error('SMSAPI fetch error:', err)
    return false
  }
}

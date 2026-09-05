import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'

/** Public auth endpoints remain reachable; all user-data routes fail closed. */
export function isProtectedPath(pathname: string): boolean {
  return pathname === '/' || pathname === '/trips' || pathname.startsWith('/trips/')
    || pathname === '/gear' || pathname.startsWith('/gear/')
}

function loginRedirect(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  return NextResponse.redirect(url)
}

export async function proxy(request: NextRequest) {
  if (!isProtectedPath(request.nextUrl.pathname)) {
    return NextResponse.next({ request })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Missing configuration must not turn a protected page into a raw 500 or
  // accidentally expose it. The login UI can then present its normal auth
  // failure while deployment diagnostics remain server-side.
  if (!supabaseUrl || !supabaseKey) {
    return loginRedirect(request)
  }

  let response = NextResponse.next({ request })

  try {
    const supabase = createServerClient<Database>(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      const redirect = loginRedirect(request)
      for (const cookie of response.cookies.getAll()) {
        redirect.cookies.set(cookie)
      }
      return redirect
    }

    return response
  } catch {
    // Fail closed. Avoid returning provider/network details to the browser.
    console.error('Unable to validate the authenticated session')
    return loginRedirect(request)
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)',
  ],
}

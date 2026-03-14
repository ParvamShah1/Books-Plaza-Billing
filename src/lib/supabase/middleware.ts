import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Redirect unauthenticated users to login
    const isAuthPage =
      request.nextUrl.pathname.startsWith("/auth/login") ||
      request.nextUrl.pathname.startsWith("/auth/signup");

    if (!user && !isAuthPage && request.nextUrl.pathname !== "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/login";
      return NextResponse.redirect(url);
    }

    // Redirect authenticated users away from auth pages
    if (user && isAuthPage) {
      const url = request.nextUrl.clone();
      url.pathname = "/invoices";
      return NextResponse.redirect(url);
    }

    // Redirect root to dashboard if authenticated
    if (user && request.nextUrl.pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/invoices";
      return NextResponse.redirect(url);
    }
  } catch {
    // If auth check fails, allow request through
    return supabaseResponse;
  }

  return supabaseResponse;
}

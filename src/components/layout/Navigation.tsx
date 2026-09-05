'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Mountain, LogOut, User, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'

export default function Navigation() {
  const { user, loading } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <nav className="border-b border-border bg-card">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <Mountain className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold text-foreground">TrailMate</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : user ? (
              <>
                <Link href="/trips" className="text-sm text-foreground hover:text-primary transition-colors">
                  Trips
                </Link>
                <Link href="/gear" className="text-sm text-foreground hover:text-primary transition-colors">
                  Gear
                </Link>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>{user.email}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm text-foreground hover:text-primary transition-colors">
                  Login
                </Link>
                <Link href="/signup" className="block">
                  <Button>Sign Up</Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-foreground hover:text-primary"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 space-y-4 border-t border-border">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : user ? (
              <>
                <Link
                  href="/trips"
                  className="block text-sm text-foreground hover:text-primary transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Trips
                </Link>
                <Link
                  href="/gear"
                  className="block text-sm text-foreground hover:text-primary transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Gear
                </Link>
                <div className="flex items-center justify-between py-2 border-t border-border">
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>{user.email}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="block text-sm text-foreground hover:text-primary transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Login
                </Link>
                <Link href="/signup" className="block" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="ghost" size="sm">Sign Up</Button>
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}

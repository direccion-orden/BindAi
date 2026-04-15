"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signOut, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logOut: () => Promise<void>;
  allowedDomain: string;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

const ALLOWED_DOMAIN = "@ordendelascosas.com";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        if (currentUser.email?.endsWith(ALLOWED_DOMAIN)) {
          setUser(currentUser);
        } else {
          // Si el dominio no es de la empresa, cerramos sesión inmediatamente.
          signOut(auth);
          setUser(null);
          // Opcional: Podrías lanzar un toast o alert
          alert(`Acceso denegado. Se requiere una cuenta de ${ALLOWED_DOMAIN}`);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      hd: ALLOWED_DOMAIN.replace("@", ""),
    });
    await signInWithPopup(auth, provider);
  };

  const logOut = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, logOut, allowedDomain: ALLOWED_DOMAIN }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

"use client";

import React, { useState } from "react";
import { collection, getDocs, doc, writeBatch, deleteField } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function MigrationPage() {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");

  const runMigration = async () => {
    if (!companyId) return;
    setLoading(true);
    setResult("Iniciando...");

    try {
      const clientsRef = collection(db, "companies", companyId, "clients");
      const snap = await getDocs(clientsRef);
      
      const batch = writeBatch(db);
      let count = 0;

      snap.forEach((document) => {
        const data = document.data();
        if (data.clientName) {
          if (!data.name) {
            batch.update(document.ref, {
              name: data.clientName,
              clientName: deleteField()
            });
            count++;
          } else {
            batch.update(document.ref, {
              clientName: deleteField()
            });
            count++;
          }
        }
      });

      if (count > 0) {
        await batch.commit();
        setResult(`¡Migración completada! Se actualizaron ${count} clientes.`);
      } else {
        setResult("Todo en orden. No se encontraron clientes con el campo obsoleto 'clientName'.");
      }
    } catch (e: any) {
      console.error(e);
      setResult(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-10 max-w-xl mx-auto space-y-6 bg-white rounded-xl shadow mt-10">
      <h1 className="text-2xl font-bold">Migración de Base de Datos</h1>
      <p className="text-muted-foreground">
        Esta herramienta buscará todos los clientes que tengan el campo viejo <code>clientName</code> y lo migrará a <code>name</code>.
      </p>

      <Button onClick={runMigration} disabled={loading || !companyId} className="w-full">
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        Ejecutar Migración
      </Button>

      {result && (
        <div className="p-4 bg-muted rounded-md mt-4 font-mono text-sm">
          {result}
        </div>
      )}
    </div>
  );
}

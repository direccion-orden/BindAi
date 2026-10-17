"use client";

import React from "react";
import { StrategicScenario, ChinaImportSku, RetailChainConfig, TrackedValue } from "@/types/strategicSimulation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataOriginBadge } from "./DataOriginBadge";
import { Ship, Truck, Plus, Trash2, HelpCircle, Package, DollarSign, Calculator } from "lucide-react";

interface ImportRetailTabProps {
  scenario: StrategicScenario;
  onUpdateScenario: (updater: (prev: StrategicScenario) => StrategicScenario) => void;
}

export function ImportRetailTab({ scenario, onUpdateScenario }: ImportRetailTabProps) {
  const updateTracked = <T,>(
    path: (sc: StrategicScenario) => TrackedValue<T>,
    newValue: T
  ) => {
    onUpdateScenario(prev => {
      const copy: StrategicScenario = JSON.parse(JSON.stringify(prev));
      const target = path(copy);
      target.value = newValue;
      target.isOverridden = true;
      target.origin = 'USER_ASSUMPTION';
      target.lastUpdated = new Date().toISOString();
      return copy;
    });
  };

  const addSku = () => {
    const skuCount = scenario.chinaImport.catalog.length + 1;
    const newSku: ChinaImportSku = {
      id: `sku-china-0${skuCount}-${Date.now()}`,
      sku: `IMP-PROD-0${skuCount}`,
      name: `Nuevo Producto Complementario ${skuCount}`,
      category: "Accesorios",
      fobPriceUSD: 3.50,
      moq: 600,
      unitsPerCarton: 24,
      cartonCbm: 0.045,
      cartonWeightKg: 8.0,
      brandedPackagingCostUSD: 0.35,
      defectRatePct: 2.0,
      retailPriceStore: 299,
      retailPriceEcommerce: 319,
      wholesalePriceRetail: 155,
      safetyStockWeeks: 6,
      initialOrderMonth: 3,
      reorderIntervalMonths: 3
    };

    onUpdateScenario(prev => {
      const copy: StrategicScenario = JSON.parse(JSON.stringify(prev));
      copy.chinaImport.catalog.push(newSku);
      return copy;
    });
  };

  const removeSku = (id: string) => {
    onUpdateScenario(prev => {
      const copy: StrategicScenario = JSON.parse(JSON.stringify(prev));
      copy.chinaImport.catalog = copy.chinaImport.catalog.filter(s => s.id !== id);
      return copy;
    });
  };

  const updateSku = (id: string, field: keyof ChinaImportSku, val: any) => {
    onUpdateScenario(prev => {
      const copy: StrategicScenario = JSON.parse(JSON.stringify(prev));
      const idx = copy.chinaImport.catalog.findIndex(s => s.id === id);
      if (idx !== -1) {
        copy.chinaImport.catalog[idx] = {
          ...copy.chinaImport.catalog[idx],
          [field]: val
        };
      }
      return copy;
    });
  };

  const addRetailChain = () => {
    const chainCount = scenario.retail.chains.length + 1;
    const newChain: RetailChainConfig = {
      id: `chain-0${chainCount}-${Date.now()}`,
      name: `Cadena Autoservicio / Retail ${chainCount}`,
      startMonth: 12,
      saleModel: 'FIRM_SALE',
      storeCount: 20,
      targetUnitsPerStoreMonthly: 30,
      wholesaleDiscountPct: {
        value: 40,
        originalValue: 40,
        origin: 'USER_ASSUMPTION',
        isOverridden: false
      },
      promotionalAllowancePct: {
        value: 5,
        originalValue: 5,
        origin: 'USER_ASSUMPTION',
        isOverridden: false
      },
      listingFeeCapex: {
        value: 35000,
        originalValue: 35000,
        origin: 'USER_ASSUMPTION',
        isOverridden: false
      },
      paymentTermsDays: {
        value: 60,
        originalValue: 60,
        origin: 'USER_ASSUMPTION',
        isOverridden: false
      },
      returnsReservePct: {
        value: 3,
        originalValue: 3,
        origin: 'USER_ASSUMPTION',
        isOverridden: false
      }
    };

    onUpdateScenario(prev => {
      const copy: StrategicScenario = JSON.parse(JSON.stringify(prev));
      copy.retail.chains.push(newChain);
      return copy;
    });
  };

  const removeRetailChain = (id: string) => {
    onUpdateScenario(prev => {
      const copy: StrategicScenario = JSON.parse(JSON.stringify(prev));
      copy.retail.chains = copy.retail.chains.filter(c => c.id !== id);
      return copy;
    });
  };

  const updateChainField = (id: string, field: string, val: any) => {
    onUpdateScenario(prev => {
      const copy: StrategicScenario = JSON.parse(JSON.stringify(prev));
      const idx = copy.retail.chains.findIndex(c => c.id === id);
      if (idx !== -1) {
        const chain: any = copy.retail.chains[idx];
        if (typeof chain[field] === "object" && chain[field] !== null && "value" in chain[field]) {
          chain[field].value = val;
          chain[field].isOverridden = true;
        } else {
          chain[field] = val;
        }
      }
      return copy;
    });
  };

  const fxRate = scenario.chinaImport.exchangeRateUSDMXN.value;

  return (
    <div className="space-y-6">
      {/* 1. Importación desde China */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Ship className="w-5 h-5 text-indigo-600" />
                Línea de Importación de Productos Complementarios (China)
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Logística internacional, tipo de cambio, aranceles, anticipos y catálogo de simulación
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-600">Activar Importaciones:</span>
              <Switch
                checked={scenario.chinaImport.isEnabled.value}
                onCheckedChange={(val) => updateTracked(sc => sc.chinaImport.isEnabled, val)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Parámetros de Comercio Exterior */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Tipo de Cambio USD/MXN</Label>
              <Input
                type="number"
                step="0.1"
                value={scenario.chinaImport.exchangeRateUSDMXN.value}
                onChange={(e) => updateTracked(sc => sc.chinaImport.exchangeRateUSDMXN, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Flete Marítimo Contenedor (USD)</Label>
              <Input
                type="number"
                value={scenario.chinaImport.seaFreightPerContainerUSD.value}
                onChange={(e) => updateTracked(sc => sc.chinaImport.seaFreightPerContainerUSD, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
              <p className="text-[10px] text-slate-400">Contenedor 40HQ (68 CBM)</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Arancel Estimado (%)</Label>
              <Input
                type="number"
                step="1"
                value={scenario.chinaImport.customsDutyAvgPct.value}
                onChange={(e) => updateTracked(sc => sc.chinaImport.customsDutyAvgPct, Number(e.target.value))}
                className="bg-white border-slate-200 font-mono text-sm"
              />
              <p className="text-[10px] text-slate-400">Impuesto General de Importación</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Regla de Pago a Fábrica</Label>
              <div className="text-xs font-medium text-slate-700 pt-2">
                <strong>{scenario.chinaImport.downPaymentPct.value}%</strong> anticipo / <strong>{scenario.chinaImport.balancePaymentPct.value}%</strong> al embarque
              </div>
              <p className="text-[10px] text-slate-400">Tránsito marítimo: ~{scenario.chinaImport.maritimeTransitDays.value} días</p>
            </div>
          </div>

          {/* Catálogo de Simulación (5 a 10 SKUs) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  Catálogo de Simulación de Productos ({scenario.chinaImport.catalog.length} SKUs)
                </h3>
                <p className="text-xs text-slate-500">
                  No requiere dar de alta artículos reales en el catálogo operativo del ERP
                </p>
              </div>
              <Button size="sm" onClick={addSku} className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
                <Plus className="w-3.5 h-3.5 mr-1" />
                Agregar SKU
              </Button>
            </div>

            <div className="rounded-lg border border-slate-200 overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-bold text-slate-700">SKU / Nombre</TableHead>
                    <TableHead className="font-bold text-slate-700">FOB (USD)</TableHead>
                    <TableHead className="font-bold text-slate-700">MOQ</TableHead>
                    <TableHead className="font-bold text-slate-700">Costo Puesto MXN</TableHead>
                    <TableHead className="font-bold text-slate-700">PVP Tienda</TableHead>
                    <TableHead className="font-bold text-slate-700">PVP Ecommerce</TableHead>
                    <TableHead className="font-bold text-slate-700">Mayoreo Retail</TableHead>
                    <TableHead className="font-bold text-slate-700">Mes Inicial</TableHead>
                    <TableHead className="text-center font-bold text-slate-700">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-sm">
                  {scenario.chinaImport.catalog.map((sku) => {
                    const estimatedLandedMXN = Math.round((sku.fobPriceUSD * fxRate * 1.35) + 8);

                    return (
                      <TableRow key={sku.id}>
                        <TableCell>
                          <div className="space-y-1 min-w-[200px]">
                            <Input
                              value={sku.name}
                              onChange={(e) => updateSku(sku.id, "name", e.target.value)}
                              className="h-7 text-xs font-semibold"
                            />
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-slate-500">{sku.sku}</span>
                              <span className="text-[10px] text-slate-400">({sku.category})</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.1"
                            value={sku.fobPriceUSD}
                            onChange={(e) => updateSku(sku.id, "fobPriceUSD", Number(e.target.value))}
                            className="h-8 w-20 text-xs font-mono font-bold"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={sku.moq}
                            onChange={(e) => updateSku(sku.id, "moq", Number(e.target.value))}
                            className="h-8 w-16 text-xs text-center font-mono"
                          />
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs font-bold text-indigo-700">
                            ${estimatedLandedMXN} MXN
                          </span>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={sku.retailPriceStore}
                            onChange={(e) => updateSku(sku.id, "retailPriceStore", Number(e.target.value))}
                            className="h-8 w-20 text-xs font-mono"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={sku.retailPriceEcommerce}
                            onChange={(e) => updateSku(sku.id, "retailPriceEcommerce", Number(e.target.value))}
                            className="h-8 w-20 text-xs font-mono"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={sku.wholesalePriceRetail}
                            onChange={(e) => updateSku(sku.id, "wholesalePriceRetail", Number(e.target.value))}
                            className="h-8 w-20 text-xs font-mono text-emerald-700 font-semibold"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={sku.initialOrderMonth}
                            onChange={(e) => updateSku(sku.id, "initialOrderMonth", Number(e.target.value))}
                            className="h-8 w-16 text-xs text-center font-mono"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeSku(sku.id)}
                            className="h-7 w-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Cadenas de Retail */}
      <Card className="border-slate-200 shadow-sm bg-white">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Truck className="w-5 h-5 text-indigo-600" />
                Venta a Cadenas de Retail
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Condiciones de entrega, venta firme vs consignación, descuentos comerciales y plazos de cobro
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-600">Activar Retail:</span>
              <Switch
                checked={scenario.retail.isEnabled.value}
                onCheckedChange={(val) => updateTracked(sc => sc.retail.isEnabled, val)}
              />
              <Button size="sm" onClick={addRetailChain} className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
                <Plus className="w-3.5 h-3.5 mr-1" />
                Agregar Cadena
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-slate-200 overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="font-bold text-slate-700 min-w-[180px]">Nombre de la Cadena</TableHead>
                  <TableHead className="font-bold text-slate-700">Mes Inicio</TableHead>
                  <TableHead className="font-bold text-slate-700">Modelo Venta</TableHead>
                  <TableHead className="font-bold text-slate-700">Nº Tiendas</TableHead>
                  <TableHead className="font-bold text-slate-700">U/Tienda/Mes</TableHead>
                  <TableHead className="font-bold text-slate-700">Descuento (%)</TableHead>
                  <TableHead className="font-bold text-slate-700">Plazo Pago</TableHead>
                  <TableHead className="font-bold text-slate-700">Listing Fee</TableHead>
                  <TableHead className="text-center font-bold text-slate-700">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-sm">
                {scenario.retail.chains.map((chain) => (
                  <TableRow key={chain.id}>
                    <TableCell>
                      <Input
                        value={chain.name}
                        onChange={(e) => updateChainField(chain.id, "name", e.target.value)}
                        className="h-8 text-xs font-semibold"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={chain.startMonth}
                        onChange={(e) => updateChainField(chain.id, "startMonth", Number(e.target.value))}
                        className="h-8 w-16 text-xs text-center font-mono"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={chain.saleModel}
                        onValueChange={(val: any) => updateChainField(chain.id, "saleModel", val)}
                      >
                        <SelectTrigger className="h-8 w-32 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FIRM_SALE">Venta Firme</SelectItem>
                          <SelectItem value="CONSIGNMENT">Consignación</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={chain.storeCount}
                        onChange={(e) => updateChainField(chain.id, "storeCount", Number(e.target.value))}
                        className="h-8 w-16 text-xs text-center font-mono"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={chain.targetUnitsPerStoreMonthly}
                        onChange={(e) => updateChainField(chain.id, "targetUnitsPerStoreMonthly", Number(e.target.value))}
                        className="h-8 w-16 text-xs text-center font-mono"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={chain.wholesaleDiscountPct.value}
                        onChange={(e) => updateChainField(chain.id, "wholesaleDiscountPct", Number(e.target.value))}
                        className="h-8 w-16 text-xs text-center font-mono text-amber-700 font-bold"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={String(chain.paymentTermsDays.value)}
                        onValueChange={(val) => updateChainField(chain.id, "paymentTermsDays", Number(val))}
                      >
                        <SelectTrigger className="h-8 w-24 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">30 días</SelectItem>
                          <SelectItem value="60">60 días</SelectItem>
                          <SelectItem value="90">90 días</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={chain.listingFeeCapex.value}
                        onChange={(e) => updateChainField(chain.id, "listingFeeCapex", Number(e.target.value))}
                        className="h-8 w-24 text-xs font-mono"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRetailChain(chain.id)}
                        className="h-7 w-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

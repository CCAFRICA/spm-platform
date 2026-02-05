'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Receipt,
  ArrowLeft,
  Building2,
  User,
  Clock,
  Users,
  CreditCard,
  Banknote,
  CheckCircle,
  XCircle,
  Calendar,
  Utensils,
  Wine,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTenant, useCurrency } from '@/contexts/tenant-context';
import { getCheques, getMeseros, getFranquicias, getTurnos } from '@/lib/restaurant-service';
import type { Cheque, Mesero, Franquicia, Turno } from '@/types/cheques';

// Mock line items for demo (in real app, this would come from a separate API)
function generateMockLineItems(cheque: Cheque) {
  const items = [];
  const foodItems = [
    { name: 'Tacos al Pastor', price: 85 },
    { name: 'Enchiladas Suizas', price: 120 },
    { name: 'Quesadilla de Flor', price: 75 },
    { name: 'Sopa Azteca', price: 65 },
    { name: 'Guacamole con Totopos', price: 95 },
    { name: 'Arrachera', price: 185 },
    { name: 'Chilaquiles', price: 90 },
    { name: 'Pozole Rojo', price: 110 },
  ];
  const drinkItems = [
    { name: 'Agua de Horchata', price: 35 },
    { name: 'Cerveza Corona', price: 55 },
    { name: 'Margarita', price: 95 },
    { name: 'Refresco', price: 30 },
    { name: 'Michelada', price: 75 },
    { name: 'Café de Olla', price: 40 },
    { name: 'Tequila Don Julio', price: 120 },
  ];

  // Generate food items based on total_alimentos
  let remainingFood = cheque.total_alimentos;
  let itemId = 1;
  while (remainingFood > 50) {
    const item = foodItems[Math.floor(Math.random() * foodItems.length)];
    const qty = Math.min(Math.floor(Math.random() * 3) + 1, Math.floor(remainingFood / item.price));
    if (qty > 0) {
      items.push({
        id: itemId++,
        name: item.name,
        category: 'Alimento',
        quantity: qty,
        unitPrice: item.price,
        total: item.price * qty,
      });
      remainingFood -= item.price * qty;
    }
    if (items.length > 8) break;
  }

  // Generate drink items based on total_bebidas
  let remainingDrinks = cheque.total_bebidas;
  while (remainingDrinks > 20) {
    const item = drinkItems[Math.floor(Math.random() * drinkItems.length)];
    const qty = Math.min(Math.floor(Math.random() * 4) + 1, Math.floor(remainingDrinks / item.price));
    if (qty > 0) {
      items.push({
        id: itemId++,
        name: item.name,
        category: 'Bebida',
        quantity: qty,
        unitPrice: item.price,
        total: item.price * qty,
      });
      remainingDrinks -= item.price * qty;
    }
    if (items.length > 12) break;
  }

  return items;
}

interface TransactionDetailData {
  cheque: Cheque;
  mesero: Mesero | null;
  franquicia: Franquicia | null;
  turno: Turno | null;
  lineItems: Array<{
    id: number;
    name: string;
    category: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
}

// Mock TechCorp transaction data
const techCorpTransaction = {
  id: 'TXN-001',
  date: '2024-12-15',
  customer: 'Acme Corp',
  product: 'Enterprise Suite',
  amount: 125000,
  commission: 8750,
  status: 'completed',
  rep: 'Sarah Chen',
  description: 'Annual enterprise license with premium support',
  paymentMethod: 'Wire Transfer',
  contractLength: '12 months',
};

export default function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const [data, setData] = useState<TransactionDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const isHospitality = currentTenant?.industry === 'Hospitality';

  const loadChequeData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [cheques, meseros, franquicias, turnos] = await Promise.all([
        getCheques(),
        getMeseros(),
        getFranquicias(),
        getTurnos(),
      ]);

      // Find cheque by numero_cheque
      const cheque = cheques.find((c: Cheque) => c.numero_cheque.toString() === id);

      if (!cheque) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      const mesero = meseros.find((m: Mesero) => m.mesero_id === cheque.mesero_id) || null;
      const franquicia = franquicias.find((f: Franquicia) => f.numero_franquicia === cheque.numero_franquicia) || null;
      const turno = turnos.find((t: Turno) => t.turno_id === cheque.turno_id) || null;
      const lineItems = generateMockLineItems(cheque);

      setData({ cheque, mesero, franquicia, turno, lineItems });
    } catch (error) {
      console.error('Error loading cheque:', error);
      setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (isHospitality) {
      loadChequeData();
    } else {
      setIsLoading(false);
    }
  }, [isHospitality, loadChequeData]);

  // TechCorp view
  if (!isHospitality) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Receipt className="h-6 w-6 text-primary" />
              Transaction {techCorpTransaction.id}
            </h1>
            <p className="text-muted-foreground">{techCorpTransaction.date}</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Transaction Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium">{techCorpTransaction.customer}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Product</span>
                <span className="font-medium">{techCorpTransaction.product}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Description</span>
                <span className="font-medium text-right max-w-[200px]">{techCorpTransaction.description}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contract Length</span>
                <span className="font-medium">{techCorpTransaction.contractLength}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sales Rep</span>
                <span className="font-medium">{techCorpTransaction.rep}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="default">{techCorpTransaction.status}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-bold text-lg">{format(techCorpTransaction.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Commission</span>
                <span className="font-medium text-green-600">{format(techCorpTransaction.commission)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment Method</span>
                <span className="font-medium">{techCorpTransaction.paymentMethod}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-4">
          <Button variant="outline" asChild>
            <Link href="/transactions">Back to Transactions</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando cheque...</p>
        </div>
      </div>
    );
  }

  // Not found state
  if (notFound || !data) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Cheque no encontrado</h1>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">
              No se encontró el cheque #{id}
            </p>
            <Button className="mt-4" asChild>
              <Link href="/transactions">Ver todos los cheques</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { cheque, mesero, franquicia, turno, lineItems } = data;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            Cheque #{cheque.numero_cheque}
          </h1>
          <p className="text-muted-foreground">
            Folio: {cheque.folio} • {cheque.fecha}
          </p>
        </div>
        <div>
          {cheque.cancelado === 1 ? (
            <Badge variant="destructive" className="flex items-center gap-1">
              <XCircle className="h-4 w-4" /> Cancelado
            </Badge>
          ) : cheque.pagado === 1 ? (
            <Badge variant="default" className="flex items-center gap-1">
              <CheckCircle className="h-4 w-4" /> Pagado
            </Badge>
          ) : (
            <Badge variant="secondary">Pendiente</Badge>
          )}
        </div>
      </div>

      {/* Check Header Info */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-900/30">
                <Building2 className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Franquicia</p>
                <p className="font-medium">{franquicia?.nombre || cheque.numero_franquicia}</p>
                {franquicia && <p className="text-xs text-muted-foreground">{franquicia.ciudad}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg dark:bg-green-900/30">
                <User className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Mesero</p>
                <p className="font-medium">{mesero?.nombre || `#${cheque.mesero_id}`}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg dark:bg-purple-900/30">
                <Clock className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Turno</p>
                <p className="font-medium">{turno?.nombre || `Turno ${cheque.turno_id}`}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg dark:bg-amber-900/30">
                <Users className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Personas</p>
                <p className="font-medium">{cheque.numero_de_personas}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timestamps */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-8">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Apertura:</span>
              <span className="text-sm font-medium">{cheque.fecha}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Cierre:</span>
              <span className="text-sm font-medium">{cheque.cierre}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle>Artículos ({cheque.total_articulos})</CardTitle>
          <CardDescription>Detalle de productos consumidos</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artículo</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-center">Cantidad</TableHead>
                <TableHead className="text-right">Precio Unit.</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="flex items-center gap-1 w-fit">
                      {item.category === 'Alimento' ? (
                        <Utensils className="h-3 w-3" />
                      ) : (
                        <Wine className="h-3 w-3" />
                      )}
                      {item.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">{item.quantity}</TableCell>
                  <TableCell className="text-right">{format(item.unitPrice)}</TableCell>
                  <TableCell className="text-right font-medium">{format(item.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Totals */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{format(cheque.subtotal)}</span>
            </div>
            {cheque.descuento > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Descuento</span>
                <span>-{format(cheque.descuento)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal c/Descuento</span>
              <span>{format(cheque.subtotal_con_descuento)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IVA (16%)</span>
              <span>{format(cheque.total_impuesto)}</span>
            </div>
            <div className="border-t pt-3 flex justify-between text-lg font-bold">
              <span>Total</span>
              <span>{format(cheque.total)}</span>
            </div>
            <div className="flex justify-between text-green-600">
              <span className="text-muted-foreground">Propina</span>
              <span className="font-medium">{format(cheque.propina)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Payment */}
        <Card>
          <CardHeader>
            <CardTitle>Método de Pago</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cheque.efectivo > 0 && (
              <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
                <div className="flex items-center gap-3">
                  <Banknote className="h-5 w-5 text-amber-600" />
                  <span className="font-medium">Efectivo</span>
                </div>
                <span className="font-bold">{format(cheque.efectivo)}</span>
              </div>
            )}
            {cheque.tarjeta > 0 && (
              <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-purple-600" />
                  <span className="font-medium">Tarjeta</span>
                </div>
                <span className="font-bold">{format(cheque.tarjeta)}</span>
              </div>
            )}

            <div className="pt-4 border-t space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Alimentos</span>
                <span className="flex items-center gap-1">
                  <Utensils className="h-3 w-3" />
                  {format(cheque.total_alimentos)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Bebidas</span>
                <span className="flex items-center gap-1">
                  <Wine className="h-3 w-3" />
                  {format(cheque.total_bebidas)}
                </span>
              </div>
              {cheque.total_cortesias > 0 && (
                <div className="flex justify-between text-sm text-blue-600">
                  <span>Cortesías</span>
                  <span>{format(cheque.total_cortesias)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        <Button variant="outline" asChild>
          <Link href="/transactions">Volver a Cheques</Link>
        </Button>
      </div>
    </div>
  );
}

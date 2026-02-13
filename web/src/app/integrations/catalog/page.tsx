'use client';

import { useState, useMemo } from 'react';
import {
  Package,
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Save,
  Settings,
  X,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTenant, useCurrency } from '@/contexts/tenant-context';

interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  status: 'active' | 'inactive';
  description?: string;
}

interface SchemaColumn {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  required: boolean;
}

const mockProducts: Product[] = [
  { id: '1', sku: 'ALI-001', name: 'Tacos al Pastor', category: 'Alimentos', price: 85, status: 'active', description: 'Tacos de cerdo marinado con piña' },
  { id: '2', sku: 'ALI-002', name: 'Enchiladas Suizas', category: 'Alimentos', price: 120, status: 'active', description: 'Enchiladas con salsa verde y crema' },
  { id: '3', sku: 'ALI-003', name: 'Quesadilla de Flor', category: 'Alimentos', price: 75, status: 'active', description: 'Quesadilla con flor de calabaza' },
  { id: '4', sku: 'ALI-004', name: 'Guacamole', category: 'Alimentos', price: 95, status: 'active', description: 'Guacamole fresco con totopos' },
  { id: '5', sku: 'ALI-005', name: 'Arrachera', category: 'Alimentos', price: 185, status: 'active', description: 'Corte de res a la parrilla' },
  { id: '6', sku: 'BEB-001', name: 'Agua de Horchata', category: 'Bebidas', price: 35, status: 'active', description: 'Agua fresca de arroz' },
  { id: '7', sku: 'BEB-002', name: 'Cerveza Corona', category: 'Bebidas', price: 55, status: 'active', description: 'Cerveza clara 355ml' },
  { id: '8', sku: 'BEB-003', name: 'Margarita', category: 'Bebidas', price: 95, status: 'active', description: 'Coctel con tequila y limón' },
  { id: '9', sku: 'BEB-004', name: 'Café de Olla', category: 'Bebidas', price: 40, status: 'inactive', description: 'Café tradicional mexicano' },
  { id: '10', sku: 'POS-001', name: 'Flan Napolitano', category: 'Postres', price: 65, status: 'active', description: 'Flan de vainilla con caramelo' },
];

const categories = ['Alimentos', 'Bebidas', 'Postres', 'Extras'];

const defaultSchema: SchemaColumn[] = [
  { id: '1', name: 'sku', type: 'string', required: true },
  { id: '2', name: 'name', type: 'string', required: true },
  { id: '3', name: 'category', type: 'string', required: true },
  { id: '4', name: 'price', type: 'number', required: true },
  { id: '5', name: 'status', type: 'string', required: true },
  { id: '6', name: 'description', type: 'string', required: false },
];

export default function ProductCatalogPage() {
  const { currentTenant } = useTenant();
  const { format } = useCurrency();
  const isSpanish = currentTenant?.locale === 'es-MX';

  const [products, setProducts] = useState<Product[]>(mockProducts);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [schemaModalOpen, setSchemaModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [schema, setSchema] = useState<SchemaColumn[]>(defaultSchema);

  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    category: '',
    price: '',
    status: 'active' as 'active' | 'inactive',
    description: '',
  });

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = !searchTerm ||
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.sku.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' || product.status === statusFilter;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, searchTerm, categoryFilter, statusFilter]);

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormData({ sku: '', name: '', category: '', price: '', status: 'active', description: '' });
    setProductModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      sku: product.sku,
      name: product.name,
      category: product.category,
      price: product.price.toString(),
      status: product.status,
      description: product.description || '',
    });
    setProductModalOpen(true);
  };

  const handleSaveProduct = () => {
    if (editingProduct) {
      setProducts(products.map(p =>
        p.id === editingProduct.id
          ? { ...p, ...formData, price: parseFloat(formData.price) || 0 }
          : p
      ));
    } else {
      const newProduct: Product = {
        id: `new-${Date.now()}`,
        sku: formData.sku,
        name: formData.name,
        category: formData.category,
        price: parseFloat(formData.price) || 0,
        status: formData.status,
        description: formData.description,
      };
      setProducts([...products, newProduct]);
    }
    setProductModalOpen(false);
  };

  const handleDelete = (id: string) => {
    setProducts(products.filter(p => p.id !== id));
  };

  const addSchemaColumn = () => {
    const newColumn: SchemaColumn = {
      id: `new-${Date.now()}`,
      name: '',
      type: 'string',
      required: false,
    };
    setSchema([...schema, newColumn]);
  };

  const removeSchemaColumn = (id: string) => {
    setSchema(schema.filter(c => c.id !== id));
  };

  const updateSchemaColumn = (id: string, field: keyof SchemaColumn, value: string | boolean) => {
    setSchema(schema.map(c =>
      c.id === id ? { ...c, [field]: value } : c
    ));
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            {isSpanish ? 'Catálogo de Productos' : 'Product Catalog'}
          </h1>
          <p className="text-muted-foreground">
            {isSpanish ? 'Administra tu catálogo de productos y precios' : 'Manage your product catalog and pricing'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSchemaModalOpen(true)}>
            <Settings className="h-4 w-4 mr-2" />
            {isSpanish ? 'Esquema' : 'Schema'}
          </Button>
          <Button onClick={openCreateModal}>
            <Plus className="h-4 w-4 mr-2" />
            {isSpanish ? 'Nuevo Producto' : 'New Product'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            {isSpanish ? 'Filtros' : 'Filters'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={isSpanish ? 'Buscar producto o SKU...' : 'Search product or SKU...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder={isSpanish ? 'Categoría' : 'Category'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isSpanish ? 'Todas las categorías' : 'All categories'}</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder={isSpanish ? 'Estado' : 'Status'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isSpanish ? 'Todos' : 'All'}</SelectItem>
                <SelectItem value="active">{isSpanish ? 'Activo' : 'Active'}</SelectItem>
                <SelectItem value="inactive">{isSpanish ? 'Inactivo' : 'Inactive'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <div className="text-sm text-muted-foreground">
        {isSpanish
          ? `Mostrando ${filteredProducts.length} de ${products.length} productos`
          : `Showing ${filteredProducts.length} of ${products.length} products`}
      </div>

      {/* Products Table */}
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>{isSpanish ? 'Nombre' : 'Name'}</TableHead>
                <TableHead>{isSpanish ? 'Categoría' : 'Category'}</TableHead>
                <TableHead>{isSpanish ? 'Precio' : 'Price'}</TableHead>
                <TableHead>{isSpanish ? 'Estado' : 'Status'}</TableHead>
                <TableHead className="text-right">{isSpanish ? 'Acciones' : 'Actions'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map(product => (
                <TableRow key={product.id}>
                  <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{product.name}</p>
                      {product.description && (
                        <p className="text-sm text-muted-foreground truncate max-w-xs">{product.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{product.category}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">{format(product.price)}</TableCell>
                  <TableCell>
                    {product.status === 'active' ? (
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        {isSpanish ? 'Activo' : 'Active'}
                      </Badge>
                    ) : (
                      <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">
                        <XCircle className="h-3 w-3 mr-1" />
                        {isSpanish ? 'Inactivo' : 'Inactive'}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => openEditModal(product)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleDelete(product.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Product Modal */}
      <Dialog open={productModalOpen} onOpenChange={setProductModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingProduct
                ? (isSpanish ? 'Editar Producto' : 'Edit Product')
                : (isSpanish ? 'Nuevo Producto' : 'New Product')}
            </DialogTitle>
            <DialogDescription>
              {isSpanish ? 'Ingresa los datos del producto' : 'Enter product details'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="ALI-001"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>{isSpanish ? 'Categoría' : 'Category'}</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={isSpanish ? 'Seleccionar' : 'Select'} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{isSpanish ? 'Nombre' : 'Name'}</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={isSpanish ? 'Nombre del producto' : 'Product name'}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{isSpanish ? 'Precio' : 'Price'}</Label>
                <Input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>{isSpanish ? 'Estado' : 'Status'}</Label>
                <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v as 'active' | 'inactive' })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{isSpanish ? 'Activo' : 'Active'}</SelectItem>
                    <SelectItem value="inactive">{isSpanish ? 'Inactivo' : 'Inactive'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{isSpanish ? 'Descripción' : 'Description'}</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={isSpanish ? 'Descripción opcional' : 'Optional description'}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductModalOpen(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button onClick={handleSaveProduct}>
              <Save className="h-4 w-4 mr-2" />
              {isSpanish ? 'Guardar' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schema Editor Modal */}
      <Dialog open={schemaModalOpen} onOpenChange={setSchemaModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {isSpanish ? 'Editor de Esquema' : 'Schema Editor'}
            </DialogTitle>
            <DialogDescription>
              {isSpanish ? 'Define las columnas del catálogo de productos' : 'Define product catalog columns'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isSpanish ? 'Columna' : 'Column'}</TableHead>
                  <TableHead>{isSpanish ? 'Tipo' : 'Type'}</TableHead>
                  <TableHead>{isSpanish ? 'Requerido' : 'Required'}</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schema.map(col => (
                  <TableRow key={col.id}>
                    <TableCell>
                      <Input
                        value={col.name}
                        onChange={(e) => updateSchemaColumn(col.id, 'name', e.target.value)}
                        placeholder={isSpanish ? 'nombre_columna' : 'column_name'}
                        className="font-mono"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={col.type}
                        onValueChange={(v) => updateSchemaColumn(col.id, 'type', v)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="string">String</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="boolean">Boolean</SelectItem>
                          <SelectItem value="date">Date</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={col.required}
                        onCheckedChange={(v) => updateSchemaColumn(col.id, 'required', !!v)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeSchemaColumn(col.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Button variant="outline" onClick={addSchemaColumn}>
              <Plus className="h-4 w-4 mr-2" />
              {isSpanish ? 'Agregar Columna' : 'Add Column'}
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSchemaModalOpen(false)}>
              {isSpanish ? 'Cancelar' : 'Cancel'}
            </Button>
            <Button onClick={() => setSchemaModalOpen(false)}>
              <Save className="h-4 w-4 mr-2" />
              {isSpanish ? 'Guardar Esquema' : 'Save Schema'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

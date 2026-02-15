/**
 * Entity Service
 *
 * CRUD operations for Financial Module entities with auto-discovery.
 * New locations and staff IDs discovered in cheque imports are
 * automatically registered as placeholder entities.
 */

import type {
  Brand,
  Franchisee,
  FranchiseLocation,
  StaffMember,
} from './types';
import { getStorageKey } from './financial-constants';

// ============================================
// STORAGE HELPERS
// ============================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function loadFromStorage<T>(_key: string): T[] {
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function saveToStorage<T>(_key: string, _data: T[]): void {
  // No-op: localStorage removed
}

// ============================================
// ENTITY SERVICE CLASS
// ============================================

export class EntityService {
  private tenantId: string;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  // ============================================
  // BRANDS
  // ============================================

  getBrands(): Brand[] {
    const key = getStorageKey('BRANDS', this.tenantId);
    return loadFromStorage<Brand>(key);
  }

  getBrand(id: string): Brand | null {
    const brands = this.getBrands();
    return brands.find(b => b.id === id) || null;
  }

  createBrand(brand: Omit<Brand, 'createdAt' | 'updatedAt'>): Brand {
    const now = new Date().toISOString();
    const newBrand: Brand = {
      ...brand,
      createdAt: now,
      updatedAt: now,
    };

    const key = getStorageKey('BRANDS', this.tenantId);
    const brands = this.getBrands();
    brands.push(newBrand);
    saveToStorage(key, brands);

    return newBrand;
  }

  updateBrand(id: string, updates: Partial<Brand>): Brand | null {
    const key = getStorageKey('BRANDS', this.tenantId);
    const brands = this.getBrands();
    const index = brands.findIndex(b => b.id === id);

    if (index === -1) return null;

    brands[index] = {
      ...brands[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    saveToStorage(key, brands);

    return brands[index];
  }

  deleteBrand(id: string): boolean {
    const key = getStorageKey('BRANDS', this.tenantId);
    const brands = this.getBrands();
    const filtered = brands.filter(b => b.id !== id);

    if (filtered.length === brands.length) return false;

    saveToStorage(key, filtered);
    return true;
  }

  // ============================================
  // FRANCHISEES
  // ============================================

  getFranchisees(): Franchisee[] {
    const key = getStorageKey('FRANCHISEES', this.tenantId);
    return loadFromStorage<Franchisee>(key);
  }

  getFranchisee(id: string): Franchisee | null {
    const franchisees = this.getFranchisees();
    return franchisees.find(f => f.id === id) || null;
  }

  createFranchisee(franchisee: Omit<Franchisee, 'createdAt' | 'updatedAt'>): Franchisee {
    const now = new Date().toISOString();
    const newFranchisee: Franchisee = {
      ...franchisee,
      createdAt: now,
      updatedAt: now,
    };

    const key = getStorageKey('FRANCHISEES', this.tenantId);
    const franchisees = this.getFranchisees();
    franchisees.push(newFranchisee);
    saveToStorage(key, franchisees);

    return newFranchisee;
  }

  updateFranchisee(id: string, updates: Partial<Franchisee>): Franchisee | null {
    const key = getStorageKey('FRANCHISEES', this.tenantId);
    const franchisees = this.getFranchisees();
    const index = franchisees.findIndex(f => f.id === id);

    if (index === -1) return null;

    franchisees[index] = {
      ...franchisees[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    saveToStorage(key, franchisees);

    return franchisees[index];
  }

  deleteFranchisee(id: string): boolean {
    const key = getStorageKey('FRANCHISEES', this.tenantId);
    const franchisees = this.getFranchisees();
    const filtered = franchisees.filter(f => f.id !== id);

    if (filtered.length === franchisees.length) return false;

    saveToStorage(key, filtered);
    return true;
  }

  // ============================================
  // LOCATIONS
  // ============================================

  getLocations(): FranchiseLocation[] {
    const key = getStorageKey('LOCATIONS', this.tenantId);
    return loadFromStorage<FranchiseLocation>(key);
  }

  getLocation(id: string): FranchiseLocation | null {
    const locations = this.getLocations();
    return locations.find(l => l.id === id) || null;
  }

  createLocation(location: Omit<FranchiseLocation, 'createdAt' | 'updatedAt'>): FranchiseLocation {
    const now = new Date().toISOString();
    const newLocation: FranchiseLocation = {
      ...location,
      createdAt: now,
      updatedAt: now,
    };

    const key = getStorageKey('LOCATIONS', this.tenantId);
    const locations = this.getLocations();
    locations.push(newLocation);
    saveToStorage(key, locations);

    return newLocation;
  }

  updateLocation(id: string, updates: Partial<FranchiseLocation>): FranchiseLocation | null {
    const key = getStorageKey('LOCATIONS', this.tenantId);
    const locations = this.getLocations();
    const index = locations.findIndex(l => l.id === id);

    if (index === -1) return null;

    locations[index] = {
      ...locations[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    saveToStorage(key, locations);

    return locations[index];
  }

  deleteLocation(id: string): boolean {
    const key = getStorageKey('LOCATIONS', this.tenantId);
    const locations = this.getLocations();
    const filtered = locations.filter(l => l.id !== id);

    if (filtered.length === locations.length) return false;

    saveToStorage(key, filtered);
    return true;
  }

  /**
   * Auto-discover location from cheque data
   * Creates placeholder if location doesn't exist
   */
  discoverLocation(locationId: string, chequeDate: string): FranchiseLocation {
    const existing = this.getLocation(locationId);

    if (existing) {
      // Update last cheque date if newer
      if (!existing.lastChequeDate || chequeDate > existing.lastChequeDate) {
        return this.updateLocation(locationId, { lastChequeDate: chequeDate })!;
      }
      return existing;
    }

    // Create placeholder location
    return this.createLocation({
      id: locationId,
      country: 'MX',
      status: 'active',
      discoveredAt: new Date().toISOString(),
      lastChequeDate: chequeDate,
    });
  }

  // ============================================
  // STAFF
  // ============================================

  getStaff(): StaffMember[] {
    const key = getStorageKey('STAFF', this.tenantId);
    return loadFromStorage<StaffMember>(key);
  }

  getStaffMember(id: string): StaffMember | null {
    const staff = this.getStaff();
    return staff.find(s => s.id === id) || null;
  }

  createStaffMember(staffMember: Omit<StaffMember, 'createdAt' | 'updatedAt'>): StaffMember {
    const now = new Date().toISOString();
    const newStaff: StaffMember = {
      ...staffMember,
      createdAt: now,
      updatedAt: now,
    };

    const key = getStorageKey('STAFF', this.tenantId);
    const staff = this.getStaff();
    staff.push(newStaff);
    saveToStorage(key, staff);

    return newStaff;
  }

  updateStaffMember(id: string, updates: Partial<StaffMember>): StaffMember | null {
    const key = getStorageKey('STAFF', this.tenantId);
    const staff = this.getStaff();
    const index = staff.findIndex(s => s.id === id);

    if (index === -1) return null;

    staff[index] = {
      ...staff[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    saveToStorage(key, staff);

    return staff[index];
  }

  deleteStaffMember(id: string): boolean {
    const key = getStorageKey('STAFF', this.tenantId);
    const staff = this.getStaff();
    const filtered = staff.filter(s => s.id !== id);

    if (filtered.length === staff.length) return false;

    saveToStorage(key, filtered);
    return true;
  }

  /**
   * Auto-discover staff member from cheque data
   * Creates placeholder if staff doesn't exist
   */
  discoverStaffMember(staffId: number, locationId: string, chequeDate: string): StaffMember {
    const id = String(staffId);
    const existing = this.getStaffMember(id);

    if (existing) {
      // Update last cheque date if newer
      if (!existing.lastChequeDate || chequeDate > existing.lastChequeDate) {
        return this.updateStaffMember(id, { lastChequeDate: chequeDate })!;
      }
      return existing;
    }

    // Create placeholder staff member
    return this.createStaffMember({
      id,
      locationId,
      role: 'server',
      status: 'active',
      discoveredAt: new Date().toISOString(),
      lastChequeDate: chequeDate,
    });
  }

  // ============================================
  // BULK DISCOVERY
  // ============================================

  /**
   * Process cheques and auto-discover all entities
   */
  discoverFromCheques(cheques: Array<{
    numeroFranquicia: string;
    meseroId: number;
    fecha: string;
  }>): { locations: number; staff: number } {
    const discoveredLocations = new Set<string>();
    const discoveredStaff = new Set<string>();

    for (const cheque of cheques) {
      // Discover location
      if (cheque.numeroFranquicia && !discoveredLocations.has(cheque.numeroFranquicia)) {
        this.discoverLocation(cheque.numeroFranquicia, cheque.fecha);
        discoveredLocations.add(cheque.numeroFranquicia);
      }

      // Discover staff
      const staffKey = `${cheque.meseroId}`;
      if (cheque.meseroId && !discoveredStaff.has(staffKey)) {
        this.discoverStaffMember(cheque.meseroId, cheque.numeroFranquicia, cheque.fecha);
        discoveredStaff.add(staffKey);
      }
    }

    return {
      locations: discoveredLocations.size,
      staff: discoveredStaff.size,
    };
  }

  // ============================================
  // CLEAR DATA (for testing)
  // ============================================

  clearAllEntities(): void {
    // No-op: localStorage removed
  }
}

/**
 * Get entity service instance for tenant
 */
export function getEntityService(tenantId: string): EntityService {
  return new EntityService(tenantId);
}

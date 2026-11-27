import express from 'express';
import type { Request, Response, NextFunction, Express } from 'express';
import {
  acknowledgeAlarmOnServer,
  appendSyncLogOnServer,
  authenticateUser,
  claimSuperuserAccount,
  createOrderOnServer,
  createProductOnServer,
  createRightsProfile,
  createStaffAccount,
  deleteAlarmOnServer,
  deleteProductOnServer,
  deleteRightsProfile,
  deleteStaffAccount,
  dispatchOrderOnServer,
  getAccountById,
  getBootstrapStatus,
  getOperationsSnapshot,
  getOrderShippingOnServer,
  getOrderTrackingOnServer,
  getOrdersForUser,
  getPublicStoreOverlay,
  HttpError,
  listRightsProfiles,
  listStaffAccounts,
  normalizeStaffPermissions,
  registerCustomerAccount,
  revokeSessionToken,
  saveShopifyConfigOnServer,
  sendStockAlarmOnServer,
  updateProductVariantsOnServer,
  updateStaffAccount,
  verifySessionToken,
} from './authStore.ts';
import {
  ALL_STAFF_PERMISSIONS,
  type AccountRole,
  type GarmentSize,
  type OrderStatus,
  type Product,
  type ShopifyConfig,
  type StaffPermission,
  type StockAlarmType,
} from '../src/types/store.ts';

interface AuthenticatedRequest extends Request {
  sessionUser?: NonNullable<ReturnType<typeof getAccountById>>;
  rawToken?: string;
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const verified = verifySessionToken(token);
  if (!verified) {
    res.status(401).json({ error: 'Invalid or expired session token.' });
    return;
  }
  const account = getAccountById(verified.sub);
  if (!account) {
    res.status(401).json({ error: 'Account is inactive or no longer exists.' });
    return;
  }
  req.sessionUser = account;
  req.rawToken = token;
  next();
}

function requireRole(allowedRoles: AccountRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    requireAuth(req, res, () => {
      if (!req.sessionUser || !allowedRoles.includes(req.sessionUser.role)) {
        res.status(403).json({ error: 'Insufficient permissions for this action.' });
        return;
      }
      next();
    });
  };
}

function requirePermission(allowedPermissions: StaffPermission[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    requireAuth(req, res, () => {
      const user = req.sessionUser;
      if (!user) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      if (user.role === 'superuser') {
        next();
        return;
      }
      if (
        user.role === 'staff' &&
        Array.isArray(user.permissions) &&
        allowedPermissions.some((p) => user.permissions.includes(p))
      ) {
        next();
        return;
      }
      res.status(403).json({
        error: 'Your employee rights profile does not grant access to this action.',
      });
    });
  };
}

function handleError(res: Response, err: unknown): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error('API Error:', err);
  res.status(500).json({ error: 'Internal server error.' });
}

export function registerApiRoutes(app: Express): void {
  app.use('/api', express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // ================= AUTH & FIRST-RUN SUPERUSER BOOTSTRAP =================

  app.get('/api/auth/bootstrap-status', (_req: Request, res: Response) => {
    try {
      res.json(getBootstrapStatus());
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/auth/bootstrap-superuser', (req: Request, res: Response) => {
    try {
      const { username, password, fullName, email } = req.body ?? {};
      const result = claimSuperuserAccount({
        username: String(username ?? ''),
        password: String(password ?? ''),
        fullName: fullName ? String(fullName) : undefined,
        email: email ? String(email) : undefined,
      });
      res.status(201).json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/auth/signup', (req: Request, res: Response) => {
    try {
      const { username, email, fullName, password } = req.body ?? {};
      const result = registerCustomerAccount({
        username: String(username ?? ''),
        email: String(email ?? ''),
        fullName: String(fullName ?? ''),
        password: String(password ?? ''),
      });
      res.status(201).json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    try {
      const { identifier, password } = req.body ?? {};
      const result = authenticateUser({
        identifier: String(identifier ?? ''),
        password: String(password ?? ''),
      });
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({ user: req.sessionUser });
  });

  app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    if (req.rawToken) {
      revokeSessionToken(req.rawToken);
    }
    res.json({ ok: true });
  });

  // ================= STAFF ACCOUNTS & RIGHTS PROFILES (SUPERUSER ONLY) =================

  app.get(
    '/api/staff',
    requireRole(['superuser']),
    (_req: AuthenticatedRequest, res: Response) => {
      try {
        res.json({ staff: listStaffAccounts() });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.post(
    '/api/staff',
    requireRole(['superuser']),
    (req: AuthenticatedRequest, res: Response) => {
      try {
        const { username, email, fullName, password, permissions, rightsProfileName } = req.body ?? {};
        const created = createStaffAccount(
          {
            username: String(username ?? ''),
            email: String(email ?? ''),
            fullName: String(fullName ?? ''),
            password: String(password ?? ''),
            permissions: Array.isArray(permissions) ? normalizeStaffPermissions(permissions) : undefined,
            rightsProfileName: typeof rightsProfileName === 'string' ? rightsProfileName : undefined,
          },
          req.sessionUser!.username
        );
        res.status(201).json({ staff: created });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.patch(
    '/api/staff/:id',
    requireRole(['superuser']),
    (req: AuthenticatedRequest, res: Response) => {
      try {
        const staffId = String(req.params.id || '').trim();
        const { active, password, fullName, permissions, rightsProfileName } = req.body ?? {};
        const updated = updateStaffAccount(
          staffId,
          {
            active: typeof active === 'boolean' ? active : undefined,
            password: typeof password === 'string' ? password : undefined,
            fullName: typeof fullName === 'string' ? fullName : undefined,
            permissions: Array.isArray(permissions) ? normalizeStaffPermissions(permissions) : undefined,
            rightsProfileName: typeof rightsProfileName === 'string' ? rightsProfileName : undefined,
          },
          req.sessionUser!.username
        );
        res.json({ staff: updated });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.delete(
    '/api/staff/:id',
    requireRole(['superuser']),
    (req: AuthenticatedRequest, res: Response) => {
      try {
        const staffId = String(req.params.id || '').trim();
        deleteStaffAccount(staffId, req.sessionUser!.username);
        res.json({ ok: true });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.get(
    '/api/staff/profiles',
    requireRole(['superuser']),
    (_req: AuthenticatedRequest, res: Response) => {
      try {
        res.json({ profiles: listRightsProfiles() });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.post(
    '/api/staff/profiles',
    requireRole(['superuser']),
    (req: AuthenticatedRequest, res: Response) => {
      try {
        const { name, description, permissions } = req.body ?? {};
        const profile = createRightsProfile(
          {
            name: String(name ?? ''),
            description: typeof description === 'string' ? description : undefined,
            permissions: Array.isArray(permissions) ? normalizeStaffPermissions(permissions) : [],
          },
          req.sessionUser!.username
        );
        res.status(201).json({ profile });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.delete(
    '/api/staff/profiles/:id',
    requireRole(['superuser']),
    (req: AuthenticatedRequest, res: Response) => {
      try {
        const profileId = String(req.params.id || '').trim();
        deleteRightsProfile(profileId, req.sessionUser!.username);
        res.json({ ok: true });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  // ================= STORE CATALOG & OPERATIONS (SUPERUSER + STAFF) =================

  app.get('/api/store/public', (_req: Request, res: Response) => {
    try {
      res.json(getPublicStoreOverlay());
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get(
    '/api/store/operations',
    requirePermission(ALL_STAFF_PERMISSIONS),
    (req: AuthenticatedRequest, res: Response) => {
      try {
        res.json(getOperationsSnapshot(req.sessionUser!));
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.post(
    '/api/store/products',
    requirePermission(['manage_catalog_variants']),
    (req: AuthenticatedRequest, res: Response) => {
      try {
        const productInput = req.body as Omit<Product, 'id' | 'shopifyId' | 'handle'>;
        if (!productInput || !productInput.title) {
          res.status(400).json({ error: 'Product title is required.' });
          return;
        }
        const created = createProductOnServer(productInput, req.sessionUser!);
        res.status(201).json({ product: created, overlay: getPublicStoreOverlay() });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.patch(
    '/api/store/products/:id',
    requirePermission(['manage_stock_thresholds', 'manage_catalog_variants']),
    (req: AuthenticatedRequest, res: Response) => {
      try {
        const productId = String(req.params.id || '').trim();
        const { baseProduct, updates } = req.body ?? {};
        const patch = (updates || {}) as {
          category?: Product['category'];
          sizingType?: Product['sizingType'];
          sizes?: GarmentSize[];
          colors?: { name: string; hex: string }[];
          stockBySize?: Partial<Record<GarmentSize, number>>;
          stockFloor?: number;
          stockCeiling?: number;
          price?: number;
          compareAtPrice?: number;
        };

        const actor = req.sessionUser!;
        if (actor.role === 'staff') {
          const touchesCatalogVariants =
            patch.category !== undefined ||
            patch.sizingType !== undefined ||
            patch.sizes !== undefined ||
            patch.colors !== undefined ||
            patch.price !== undefined ||
            patch.compareAtPrice !== undefined;
          const touchesStockThresholds =
            patch.stockBySize !== undefined ||
            patch.stockFloor !== undefined ||
            patch.stockCeiling !== undefined;

          if (touchesCatalogVariants && !actor.permissions.includes('manage_catalog_variants')) {
            res.status(403).json({
              error: 'Your rights profile does not allow modifying inventory categories, sizing types, sizes, colors, or pricing.',
            });
            return;
          }
          if (
            touchesStockThresholds &&
            !actor.permissions.includes('manage_stock_thresholds') &&
            !actor.permissions.includes('manage_catalog_variants')
          ) {
            res.status(403).json({
              error: 'Your rights profile does not allow modifying stock counts or thresholds.',
            });
            return;
          }
        }

        updateProductVariantsOnServer(
          productId,
          baseProduct as Product | undefined,
          patch,
          actor
        );
        res.json({ ok: true, overlay: getPublicStoreOverlay() });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.delete(
    '/api/store/products/:id',
    requirePermission(['manage_catalog_variants']),
    (req: AuthenticatedRequest, res: Response) => {
      try {
        const productId = String(req.params.id || '').trim();
        deleteProductOnServer(productId, req.sessionUser!);
        res.json({ ok: true, overlay: getPublicStoreOverlay() });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.post(
    '/api/store/alarms',
    requirePermission(['manage_stock_thresholds']),
    (req: AuthenticatedRequest, res: Response) => {
      try {
        const body = req.body ?? {};
        const alarm = sendStockAlarmOnServer(
          {
            productId: String(body.productId || ''),
            productTitle: String(body.productTitle || 'Product'),
            alarmType: (body.alarmType as StockAlarmType) || 'BELOW_FLOOR',
            triggerScope: body.triggerScope === 'size' ? 'size' : 'total',
            size: body.size as GarmentSize | undefined,
            currentQuantity: Number(body.currentQuantity ?? 0),
            threshold: Number(body.threshold ?? 0),
            recipientEmail: String(body.recipientEmail || req.sessionUser!.email),
            message: String(body.message || 'Stock threshold alert'),
          },
          req.sessionUser!
        );
        res.status(201).json({ alarm });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.patch(
    '/api/store/alarms/:id/ack',
    requirePermission(['manage_stock_thresholds']),
    (req: AuthenticatedRequest, res: Response) => {
      try {
        acknowledgeAlarmOnServer(String(req.params.id || '').trim());
        res.json({ ok: true });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.delete(
    '/api/store/alarms/:id',
    requirePermission(['manage_stock_thresholds']),
    (req: AuthenticatedRequest, res: Response) => {
      try {
        deleteAlarmOnServer(String(req.params.id || '').trim());
        res.json({ ok: true });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.put(
    '/api/store/integrations/shopify',
    requirePermission(['manage_integrations']),
    (req: AuthenticatedRequest, res: Response) => {
      try {
        saveShopifyConfigOnServer(req.body as ShopifyConfig, req.sessionUser!);
        res.json({ ok: true });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.post(
    '/api/store/integrations/log',
    requirePermission(['manage_integrations']),
    (req: AuthenticatedRequest, res: Response) => {
      try {
        const { event, details, status } = req.body ?? {};
        appendSyncLogOnServer(
          String(event || 'OPS_EVENT'),
          String(details || ''),
          status === 'warning' || status === 'success' ? status : 'info'
        );
        res.json({ ok: true });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  // ================= CUSTOMER ORDERS & DISPATCH =================

  app.post('/api/orders', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const { items, customer, discountPercentage, currentProducts } = req.body ?? {};
      const order = createOrderOnServer({
        user: req.sessionUser!,
        items: Array.isArray(items) ? items : [],
        customer,
        discountPercentage: Number(discountPercentage ?? 0),
        currentProducts: Array.isArray(currentProducts) ? currentProducts : [],
      });
      res.status(201).json({ order, overlay: getPublicStoreOverlay() });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get('/api/orders/mine', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const orders = getOrdersForUser(req.sessionUser!.id);
      res.json({ orders });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get(
    '/api/orders/:orderNumber/shipping',
    requireAuth,
    (req: AuthenticatedRequest, res: Response) => {
      try {
        const info = getOrderShippingOnServer(
          String(req.params.orderNumber || ''),
          req.sessionUser!
        );
        res.json({ shipping: info });
      } catch (err) {
        handleError(res, err);
      }
    }
  );

  app.get('/api/orders/:orderNumber/tracking', (req: Request, res: Response) => {
    try {
      const record = getOrderTrackingOnServer(String(req.params.orderNumber || ''));
      if (!record) {
        res.status(404).json({ error: 'Order tracking record not found.' });
        return;
      }
      res.json({ tracking: record });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.patch(
    '/api/orders/:orderNumber/dispatch',
    requirePermission(['execute_order_dispatch']),
    (req: AuthenticatedRequest, res: Response) => {
      try {
        const { nextStatus, courier, trackingNumber, dispatchNotes, deductStock, products } =
          req.body ?? {};
        const updatedOrder = dispatchOrderOnServer(
          {
            orderNumber: String(req.params.orderNumber || ''),
            nextStatus: (nextStatus as OrderStatus) || 'Dispatched',
            courier: String(courier || ''),
            trackingNumber: String(trackingNumber || ''),
            dispatchNotes: dispatchNotes ? String(dispatchNotes) : undefined,
            deductStock: Boolean(deductStock),
            products: Array.isArray(products) ? products : undefined,
          },
          req.sessionUser!
        );
        res.json({ order: updatedOrder });
      } catch (err) {
        handleError(res, err);
      }
    }
  );
}

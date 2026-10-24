import { Routes } from '@angular/router';
import { authGuard, moduleGuard, superGuard } from './core/auth.service';
import { Shell } from './layout/shell';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login/login').then((m) => m.Login) },
  { path: 'super', canActivate: [superGuard], loadComponent: () => import('./pages/super/super-panel').then((m) => m.SuperPanel) },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inbox' },
      { path: 'dashboard', canActivate: [moduleGuard('crm')], loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.Dashboard) },
      { path: 'inbox', loadComponent: () => import('./pages/inbox/inbox').then((m) => m.Inbox) },
      { path: 'inbox/:id', loadComponent: () => import('./pages/inbox/inbox').then((m) => m.Inbox) },
      { path: 'pipeline', canActivate: [moduleGuard('crm')], loadComponent: () => import('./pages/pipeline/pipeline').then((m) => m.Pipeline) },
      { path: 'contacts', canActivate: [moduleGuard('crm')], loadComponent: () => import('./pages/contacts/contacts').then((m) => m.Contacts) },
      { path: 'tasks', canActivate: [moduleGuard('crm')], loadComponent: () => import('./pages/tasks/tasks').then((m) => m.Tasks) },
      { path: 'catalog', loadComponent: () => import('./pages/catalog/catalog').then((m) => m.Catalog) },
      { path: 'templates', loadComponent: () => import('./pages/templates/templates').then((m) => m.Templates) },
      { path: 'flow', canActivate: [moduleGuard('chatbot')], loadComponent: () => import('./pages/flow/flow-editor').then((m) => m.FlowEditor) },
      { path: 'automation', canActivate: [moduleGuard('chatbot')], loadComponent: () => import('./pages/automation/automation').then((m) => m.Automation) },
      { path: 'channels', loadComponent: () => import('./pages/channels/channels').then((m) => m.Channels) },
      { path: 'settings', loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings) },
    ],
  },
  { path: '**', redirectTo: '' },
];

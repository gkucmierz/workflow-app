import { createRouter, createWebHistory } from 'vue-router';
import BoardView from '../views/BoardView.vue';
import TaskEditorView from '../views/TaskEditorView.vue';

const routes = [
  {
    path: '/',
    name: 'home',
    component: BoardView
  },
  {
    path: '/p/:project',
    name: 'project-board',
    component: BoardView
  },
  {
    path: '/p/:project/tasks/new',
    name: 'task-new',
    component: TaskEditorView
  },
  {
    path: '/p/:project/tasks/:taskId',
    name: 'task-edit',
    component: TaskEditorView
  },
  {
    path: '/scripts',
    name: 'scripts',
    component: () => import('../views/ScriptsView.vue')
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;

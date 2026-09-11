import { ref, computed } from 'vue';

export const projects = ref([]);
export const workspaceProjects = ref([]);

export const totalActiveTasks = computed(() => {
  return projects.value.reduce((sum, p) => sum + (p.activeTasks || 0), 0);
});

export const fetchProjects = async () => {
  try {
    const res = await fetch('/api/projects');
    const data = await res.json();
    projects.value = data;
    return data;
  } catch (err) {
    console.error('Failed to fetch projects:', err);
    return [];
  }
};

export const fetchWorkspaceProjects = async () => {
  try {
    const res = await fetch('/api/workspace-projects');
    const data = await res.json();
    workspaceProjects.value = data;
    return data;
  } catch (err) {
    console.error('Failed to fetch workspace projects:', err);
    return [];
  }
};

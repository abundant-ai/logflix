// Shared repository configuration for LogFlix
export const ORGANIZATION = 'abundant-ai';

export interface Repository {
  name: string;
  workflow: string;
  description?: string;
  defaultBranch?: string;
}

export const REPOSITORIES: Repository[] = [
  {
    name: 'tbench-hammer',
    workflow: 'test-tasks.yaml',
    description: 'Terminal Bench Hammer track',
    defaultBranch: 'main'
  },
  {
    name: 'sept-2-export',
    workflow: 'test-tasks.yaml',
    description: 'Terminal Bench Export track',
    defaultBranch: 'main'
  },
  // Add more repositories here as needed
  // {
  //   name: 'another-repo',
  //   workflow: 'test.yaml',
  //   description: 'Description of another repository',
  //   defaultBranch: 'main'
  // },
];
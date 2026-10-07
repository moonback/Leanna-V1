/// <reference types="vite/client" />

declare module '*.png';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.svg';
declare module '*.webp';
declare module '*.mp4';
declare module '*.webm';

// Imports CSS en side-effect (ex: import './styles/notebooklm.css')
declare module '*.css';
declare module '*.scss';
declare module '*.sass';
declare module '*.less';

// CSS Modules (import styles from './x.module.css')
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
declare module '*.module.scss' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

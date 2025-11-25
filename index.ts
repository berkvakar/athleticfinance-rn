// Polyfills must be imported first
import 'react-native-get-random-values';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that the environment is set up appropriately for native builds
registerRootComponent(App);
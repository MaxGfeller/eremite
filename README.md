# Eremite.js

## Installation

Eremite can currently be installed from Github using [npm](https://www.npmjs.com/):

```bash
npm install @cyon/eremite
```

An `.npmrc` configuration file needs to be available, it can be copied from the `.npmrc.example`. Just make sure to add the API key.

## Prerequisites

The project uses [class decorators](https://github.com/tc39/proposal-decorators), an ECMAScript proposal that is currently in stage 2. That's why right now it's neccessary to use a polyfill for it.

For a Typescript project, this can be done by adding the following to the `tsconfig.json` file:

```typescript
"compilerOptions": {
  "experimentalDecorators": true
}
```

In a Javascript project, it can be done by using the [`@babel/plugin-proposal-decorators` Babel plugin](https://babeljs.io/docs/en/babel-plugin-proposal-decorators).

## Initializing

```typescript

```

## Storage

Eremite uses [localForage](https://github.com/localForage/localForage) as its storage backend. When using it in the browser, it automatically uses the best available storage mechanism. Usually this is [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) but, it falls back to [localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) depending on the browser support.

For tests you can use an [in-memory backend](https://www.npmjs.com/package/localforage-driver-memory):

```typescript
import * as memoryDriver from 'localforage-driver-memory'
import { Eremite, BrowserConnectionIndicator } from '@cyon/eremite'

const store = new Eremite({
  connectionIndicator: new BrowserConnectionIndicator(),
  forageDriverDefinition: memoryDriver,
  forageDriver: memoryDriver._driver
})
```

## Connection Indicators

The eremite store needs to know if there is an active connection to the backend of the application. That's why, when initializing a new Eremite store, you need to pass a connection indicator. The connection indicator is a class that implements the `ConnectionIndicator` interface and indicates if there is an active connection or not, and emits event in case it changes.

There is a default implementation that uses just the browser `navigator.onLine` property and events, it can be used as follows:

```typescript
import { BrowserConnectionIndicator, createStore } from '@cyon/eremite'

createStore({
  connectionIndicator: new BrowserConnectionIndicator()
})
```

It is advised that you implement your own connection indicator, which also checks if your backend is reachable. You can utilize the `BrowserConnectionIndicator` and add your own checks.

## Resources

### Mutations and Queue

```typescript
@Queueable()
@Mutate(({ state, createTemporaryIdentifier }, user) => {
  user.id = createTemporaryIdentifier('user')

  state.users.unshift(user)
})
async createUser (user: User): Promise<User> {
  const { mutation } = useContext(this)

  const result = await User.createUser(user)

  mutation.updateTemporaryId('user', user.id)
}
```

### Consolidation

## Plugins

Plugins can be used to extend the functionality of Eremite itself. They are classes that implement the `Plugin` interface and can be used as follows:

```typescript
import { MemoryCache, createStore } from '@cyon/eremite'

createStore({
  plugins: [ new MemoryCache() ]
})
```

### Encrypt

### Cleanup
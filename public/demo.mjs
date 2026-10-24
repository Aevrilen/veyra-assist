import { createMockRecognitionProvider } from './recognition-provider.mjs'

const provider = createMockRecognitionProvider()
provider.showExample()
console.log(JSON.stringify(provider.getSnapshot(), null, 2))

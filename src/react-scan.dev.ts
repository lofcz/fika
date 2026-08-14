import { scan } from 'react-scan'

const twProperties = document.createElement('style')
twProperties.textContent = `
@property --tw-translate-x { syntax: "*"; inherits: false; initial-value: 0; }
@property --tw-translate-y { syntax: "*"; inherits: false; initial-value: 0; }
@property --tw-translate-z { syntax: "*"; inherits: false; initial-value: 0; }
@property --tw-scale-x { syntax: "*"; inherits: false; initial-value: 1; }
@property --tw-scale-y { syntax: "*"; inherits: false; initial-value: 1; }
@property --tw-scale-z { syntax: "*"; inherits: false; initial-value: 1; }
@property --tw-space-y-reverse { syntax: "*"; inherits: false; initial-value: 0; }
@property --tw-divide-y-reverse { syntax: "*"; inherits: false; initial-value: 0; }
@property --tw-border-style { syntax: "*"; inherits: false; initial-value: solid; }
@property --tw-shadow { syntax: "*"; inherits: false; initial-value: 0 0 #0000; }
@property --tw-shadow-alpha { syntax: "<percentage>"; inherits: false; initial-value: 100%; }
@property --tw-inset-shadow { syntax: "*"; inherits: false; initial-value: 0 0 #0000; }
@property --tw-inset-shadow-alpha { syntax: "<percentage>"; inherits: false; initial-value: 100%; }
@property --tw-ring-shadow { syntax: "*"; inherits: false; initial-value: 0 0 #0000; }
@property --tw-inset-ring-shadow { syntax: "*"; inherits: false; initial-value: 0 0 #0000; }
@property --tw-ring-offset-width { syntax: "<length>"; inherits: false; initial-value: 0px; }
@property --tw-ring-offset-color { syntax: "*"; inherits: false; initial-value: #fff; }
@property --tw-ring-offset-shadow { syntax: "*"; inherits: false; initial-value: 0 0 #0000; }
@property --tw-outline-style { syntax: "*"; inherits: false; initial-value: solid; }
@property --tw-drop-shadow-alpha { syntax: "<percentage>"; inherits: false; initial-value: 100%; }
@property --tw-content { syntax: "*"; inherits: false; initial-value: ""; }
`
document.head.append(twProperties)

scan({
  enabled: true,
  showToolbar: true,
  log: false,
  dangerouslyForceRunInProduction: false,
})

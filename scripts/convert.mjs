import fs from 'fs'
import { sep } from './util.mjs'
import { interfaceDir } from '/env.mjs'

const scope = process.argv[2]

if (!scope) {
    console.error('Please provide a scope to convert.')
    process.exit(1)
}

if (scope === 'ohif') {
    const folder = process.argv.length > 3 && process.argv.slice(3).includes('--prod') ? 'build' : 'public'
    const ohifDir = [interfaceDir, folder, 'ohif'].join(sep)
    if (!fs.existsSync(ohifDir)) {
        console.error(`Directory ${ohifDir} does not exist.`)
        process.exit(1)
    }
    const styleFile = [ohifDir, 'app.bundle.css'].join(sep)
    if (!fs.existsSync(styleFile)) {
        console.error(`OHIF style bundle does not exist.`)
        process.exit(1)
    }
    // The OHIF viewer uses a global CSS file that will mess up any defaults and styles with conflicting names in the
    // Epicurrents interface. We need to convert the global styles into scoped styles that only affect the OHIF viewer
    // element and dynamic modal elements.
    console.info(`Converting global OHIF styles to scoped styles at ${ohifDir}...`)
    const styles = fs.readFileSync(styleFile, 'utf8')
                     // Remove all new lines.
                     .replace(/(\r?\n)+/g, '')
                     // Remove all comments.
                     .replace(/\/\*[\s\S]*?\*\//g, '')
    // Split the styles into individual lines and remove empty lines.
    const lines = styles.split('\n').filter(line => line.trim())
    const out = []
    for (const line of lines) {
        // Split by closing curly brace.
        const parts = line.split('}').map(part => part.replace(/^(.+?),(.*?)\{$/g, '$1,\n$2{'))
        const regex = /(^|\})([^\/|@|\}|to|\d+%][^\{]+)\{/
        out.push(parts.map(part => {
            const trimmed = part.trim()
            // Add the OHIF scope to the beginning of each style line.
            let converted = ''
            const selectors = trimmed.match(regex)
            if (selectors) {
                // Split by commas in case there are multiple selectors on the same line.
                const selList = selectors[2].split(',')
                                .map(s => {
                                    // :root, html and body are special cases containing defaults and vars, we point
                                    // those to the elements themselves. The rest of the selectors are we will prefix
                                    // with the parent element selectors to scope them.
                                    const st = s.trim()
                                    const selector = st.startsWith(':root') ||
                                                     st.startsWith('html') ||
                                                     st.startsWith('body')
                                                   ? '' : ` ${st}`
                                    // The viewer element can be targeted with parent element ID but for the modals we
                                    // need to use whatever selector is present.
                                    return `[data-component=radiology-interface]${
                                            selector
                                        },.ReactModalPortal${
                                            selector
                                        },[data-radix-popper-content-wrapper]${
                                            selector
                                        }`
                                }).join(',')
                converted = trimmed.replace(regex, `${selectors[1]}${selList}{`)
            } else {
                converted = trimmed
            }
            return converted
        }))
    }
    const outFileName = 'epicurrents.bundle.css'
    const epicStyles = [ohifDir, outFileName].join(sep)
    fs.writeFileSync(epicStyles, out.flat().join('}'), 'utf8')
    console.info(`OHIF converted styles written to ${outFileName}.`)
}

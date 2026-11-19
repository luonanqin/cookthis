'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const dir = __dirname
const js = fs.readFileSync(path.join(dir, 'confirm.js'), 'utf8')
const wxml = fs.readFileSync(path.join(dir, 'confirm.wxml'), 'utf8')
const wxss = fs.readFileSync(path.join(dir, 'confirm.wxss'), 'utf8')

describe('confirm seasonal drawer', () => {
  it('shows selected/total copy and opens drawer from preview', () => {
    assert.match(wxml, /已选 \{\{seasonalCount\}\} \/ 共 \{\{seasonalTotal\}\}/)
    assert.match(
      wxml,
      /四季常见 · 已选 \{\{yearRoundCount\}\} \/ 共 \{\{yearRoundTotal\}\}/
    )
    assert.match(wxml, /seasonalFlat/)
    assert.match(wxml, /onOpenSeasonalDrawer/)
    assert.match(wxml, /seasonalDrawerOpen/)
    assert.match(wxml, /onCloseSeasonalDrawer/)
    assert.match(wxml, />完成</)
    assert.match(js, /seasonalTotal/)
    assert.match(js, /yearRoundTotal/)
    assert.match(js, /flattenSeasonalGroups/)
    assert.match(js, /onOpenSeasonalDrawer/)
    assert.match(js, /onCloseSeasonalDrawer/)
    assert.match(wxss, /season-preview/)
    const drawerAt = wxml.indexOf('seasonalDrawerOpen')
    const actionsAt = wxml.indexOf('season-actions')
    assert.ok(drawerAt >= 0 && actionsAt > drawerAt)
  })
})

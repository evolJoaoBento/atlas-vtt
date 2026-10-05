import { t } from '../../i18n';
import React from "react"
import { useAtlasSettings } from "../../keyboard/useMapHotkeys"
import {
  DEFAULT_LASER_POINTER_SETTINGS,
  LASER_SIZE_MAX,
  LASER_SIZE_MIN,
} from "../../tools/laserPointerSettings"
import { laserColorHint, laserColorSwatches } from "../../i18n/sharedTexts"
import { DropdownSliderRow } from "./primitives/DropdownSliderRow"
import { DropdownSwatchGrid } from "./primitives/DropdownSwatchGrid"

/** Colour and size of the laser pointer, saved in Atlas' settings for every map. */
export function LaserPointerOptions(): React.ReactElement {
  const settings = useAtlasSettings()
  const { color, size } = settings?.getLaserPointerSettings() ?? DEFAULT_LASER_POINTER_SETTINGS

  return (
    <div className="atlas-dropdown-section">
      <DropdownSwatchGrid
        label={t('toolbar.laserColour')}
        swatches={laserColorSwatches()}
        value={color}
        onChange={(value) => settings?.setLaserPointerSettings({ color: value })}
        hint={laserColorHint()}
      />
      <DropdownSliderRow
        label={t('toolbar.laserSize')}
        value={size}
        min={LASER_SIZE_MIN}
        max={LASER_SIZE_MAX}
        onChange={(value) => settings?.setLaserPointerSettings({ size: value })}
      />
    </div>
  )
}

import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { Card, Label } from './theme';
import { SettingsContentDisclosure, SettingsContentGroup, SettingsContentRow, settingsContentStyles } from './settings-secondary-content';

const imageCredits = [
            ['Sebastian Kawa, Tomasz Kawa · GrandPrixGlidingChile.JPG', 'CC BY-SA 3.0', 'https://commons.wikimedia.org/wiki/File:GrandPrixGlidingChile.JPG', 'https://creativecommons.org/licenses/by-sa/3.0/'],
            ['Dg-505 · Sunset', 'CC BY 3.0', 'https://commons.wikimedia.org/wiki/File:Sunset_-_panoramio_(312).jpg', 'https://creativecommons.org/licenses/by/3.0/'],
            ['Partonez · Windsock at Bolt Head Airfield', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Windsock_at_Bolt_Head_Airfield.jpg', 'https://creativecommons.org/licenses/by-sa/4.0/'],
            ['L293D · Glider (sailplane).jpg · Wikimedia Commons · resized and recompressed', 'CC0 1.0', 'https://commons.wikimedia.org/wiki/File:Glider_(sailplane).jpg', 'https://creativecommons.org/publicdomain/zero/1.0/'],
            ['Anne Burgess · Clubhouse at Dusk · Geograph, via Wikimedia Commons', 'CC BY-SA 2.0', 'https://commons.wikimedia.org/wiki/File:Clubhouse_at_Dusk_-_geograph.org.uk_-_6960024.jpg', 'https://creativecommons.org/licenses/by-sa/2.0/'],
] as const;

const svgLicense = "The MIT License (MIT)\n\nCopyright (c) [2015-2016] [Horcrux]\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n";

export function AboutCredits() {
  const [linkError, setLinkError] = useState(false);
  async function open(url: string) {
    setLinkError(false);
    try { await Linking.openURL(url); }
    catch { setLinkError(true); }
  }
  return <View style={settingsContentStyles.content}>
    <Card><Label>Bildnachweise & Lizenzen</Label><Label muted>Dekorative Bilder, keine Flug-, Wetter- oder Vereinsdaten. Darstellung mit Ausschnitt und dunkler Farbüberlagerung. Bildlizenzen gelten unabhängig vom Anwendungscode.</Label></Card>
    {linkError && <View accessibilityRole="alert" accessibilityLiveRegion="polite"><Label>Der Link konnte nicht geöffnet werden. Du kannst die Adresse im Bildnachweis markieren und kopieren.</Label></View>}
    <SettingsContentGroup title="Software"><SettingsContentDisclosure title="Vektordiagramme" summary="react-native-svg · MIT"><Label selectable muted>{svgLicense}</Label></SettingsContentDisclosure></SettingsContentGroup>
    <SettingsContentGroup title="Bildnachweise">
      {imageCredits.map(([author, license, source, licenseUrl]) => <SettingsContentDisclosure key={author} title={author} summary={license}>
        <SettingsContentRow title="Original & Urheber" summary="Externen Bildnachweis öffnen" onPress={() => void open(source)} />
        <Label selectable muted>{source}</Label>
        <SettingsContentRow title={license} summary="Lizenzbedingungen öffnen" onPress={() => void open(licenseUrl)} />
        <Label selectable muted>{licenseUrl}</Label>
      </SettingsContentDisclosure>)}
    </SettingsContentGroup>
  </View>;
}

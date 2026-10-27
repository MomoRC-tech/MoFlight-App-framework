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

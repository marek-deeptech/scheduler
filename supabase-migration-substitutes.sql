-- Migration: artist_substitutes
-- Run in Supabase SQL Editor (Dashboard > SQL Editor)

CREATE TABLE IF NOT EXISTS artist_substitutes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  substitute_id uuid NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(artist_id)
);

-- RLS: allow read for authenticated users
ALTER TABLE artist_substitutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read" ON artist_substitutes FOR SELECT USING (true);
CREATE POLICY "Allow all for authenticated" ON artist_substitutes
  FOR ALL USING (auth.role() = 'authenticated');

-- Insert pairings
INSERT INTO artist_substitutes (artist_id, substitute_id) VALUES
  -- ♀ Agnieszka Skrzypczak → zastępuje: Agnieszka Więdłocha
  ('4b8d068d-30fc-4ec9-b0c6-8bfc81d6ea45', 'bb3604c3-64ad-42ff-8d05-b77d7c9040eb'),
  -- ♀ Agnieszka Więdłocha → zastępuje: Aleksandra Pisula
  ('bb3604c3-64ad-42ff-8d05-b77d7c9040eb', '2caad58a-957f-4ba9-8b35-6bf59cdc3651'),
  -- ♀ Aleksandra Pisula → zastępuje: Aleksandra Popławska
  ('2caad58a-957f-4ba9-8b35-6bf59cdc3651', '197a9710-6b3e-44e1-94cc-dd17433f8f47'),
  -- ♀ Aleksandra Popławska → zastępuje: Alicja Czerniewicz
  ('197a9710-6b3e-44e1-94cc-dd17433f8f47', 'a123e534-9b98-4caf-a8b8-559afefe7af6'),
  -- ♀ Alicja Czerniewicz → zastępuje: Anna Seniuk
  ('a123e534-9b98-4caf-a8b8-559afefe7af6', '27fbd642-dd36-4e59-99e6-0134b6fb67ce'),
  -- ♀ Anna Seniuk → zastępuje: Beata Ścibakówna
  ('27fbd642-dd36-4e59-99e6-0134b6fb67ce', '5bce9af8-16ef-40c6-875f-088bb743a977'),
  -- ♀ Beata Ścibakówna → zastępuje: Dorota Landowska
  ('5bce9af8-16ef-40c6-875f-088bb743a977', '2e2bb41e-ef5f-41fb-9e94-c15ea21873e2'),
  -- ♀ Dorota Landowska → zastępuje: Eliza Rycembel
  ('2e2bb41e-ef5f-41fb-9e94-c15ea21873e2', '489e7e1c-e0a3-4c1d-8b04-80d7a6e5d5e1'),
  -- ♀ Eliza Rycembel → zastępuje: Emilia Krakowska
  ('489e7e1c-e0a3-4c1d-8b04-80d7a6e5d5e1', 'fbb521f5-f91c-412b-b132-40cecfc6d84a'),
  -- ♀ Emilia Krakowska → zastępuje: Ewa Decówna
  ('fbb521f5-f91c-412b-b132-40cecfc6d84a', '7aa0adc2-c0fc-46f8-9d12-a05d6ee3b3e3'),
  -- ♀ Ewa Decówna → zastępuje: Ewa Florczak
  ('7aa0adc2-c0fc-46f8-9d12-a05d6ee3b3e3', '2471f912-ebab-4ebd-a215-d462fa64dd47'),
  -- ♀ Ewa Florczak → zastępuje: Ewa Kasprzyk
  ('2471f912-ebab-4ebd-a215-d462fa64dd47', '558d2811-efb3-4743-b652-adab199bb168'),
  -- ♀ Ewa Kasprzyk → zastępuje: Gabriela Muskała
  ('558d2811-efb3-4743-b652-adab199bb168', '3acf186a-cd8b-453e-a39d-fbdf0b81bd01'),
  -- ♀ Gabriela Muskała → zastępuje: Hanna Śleszyńska
  ('3acf186a-cd8b-453e-a39d-fbdf0b81bd01', '9d71eeae-6a00-4120-b741-0e5d1783f982'),
  -- ♀ Hanna Śleszyńska → zastępuje: Ilona Ostrowska
  ('9d71eeae-6a00-4120-b741-0e5d1783f982', 'ffb7e374-9c05-4f39-b643-95f4c99ef5b5'),
  -- ♀ Ilona Ostrowska → zastępuje: Julia Wyszyńska
  ('ffb7e374-9c05-4f39-b643-95f4c99ef5b5', 'c4a9c669-b39d-4788-80fb-9122af76c159'),
  -- ♀ Julia Wyszyńska → zastępuje: Justyna Ducka
  ('c4a9c669-b39d-4788-80fb-9122af76c159', '263ba2a5-5ae4-4481-ba6f-7a44e86eefcb'),
  -- ♀ Justyna Ducka → zastępuje: Kamilla Baar
  ('263ba2a5-5ae4-4481-ba6f-7a44e86eefcb', '81437d29-5a4b-407e-b070-0a1e7cb56215'),
  -- ♀ Kamilla Baar → zastępuje: Karolina Bacia
  ('81437d29-5a4b-407e-b070-0a1e7cb56215', '13953e25-32f8-432b-aa4d-2cb3796d4f44'),
  -- ♀ Karolina Bacia → zastępuje: Katarzyna Gniewkowska
  ('13953e25-32f8-432b-aa4d-2cb3796d4f44', '37e02612-2835-4d03-bdfe-31aab6886e58'),
  -- ♀ Katarzyna Gniewkowska → zastępuje: Krystyna Janda
  ('37e02612-2835-4d03-bdfe-31aab6886e58', 'cc4f495c-e109-4a14-a0ce-41bd786dd3f6'),
  -- ♀ Krystyna Janda → zastępuje: Lidia Sadowa
  ('cc4f495c-e109-4a14-a0ce-41bd786dd3f6', '7854aad0-e1d7-4371-b113-20fbd6427e14'),
  -- ♀ Lidia Sadowa → zastępuje: Magdalena Boczarska
  ('7854aad0-e1d7-4371-b113-20fbd6427e14', '0536c301-a55f-4a3e-b04d-33c8c8e8e073'),
  -- ♀ Magdalena Boczarska → zastępuje: Magdalena Stużyńska
  ('0536c301-a55f-4a3e-b04d-33c8c8e8e073', '4ec557f8-f11a-4726-b75f-7baf8629602e'),
  -- ♀ Magdalena Stużyńska → zastępuje: Magdalena Zawadzka
  ('4ec557f8-f11a-4726-b75f-7baf8629602e', '58f6950c-a67d-4377-82e6-0919b608943d'),
  -- ♀ Magdalena Zawadzka → zastępuje: Maja Komorowska
  ('58f6950c-a67d-4377-82e6-0919b608943d', 'a07c28ae-891b-4700-b145-94f83874b589'),
  -- ♀ Maja Komorowska → zastępuje: Małgorzata Kocik
  ('a07c28ae-891b-4700-b145-94f83874b589', 'a3b5a85c-d626-4d46-83e2-79588359afa0'),
  -- ♀ Małgorzata Kocik → zastępuje: Małgorzata Kożuchowska
  ('a3b5a85c-d626-4d46-83e2-79588359afa0', '2c3c3609-b30f-4b9f-bfc8-b103272250e9'),
  -- ♀ Małgorzata Kożuchowska → zastępuje: Małgorzata Rożniatowska
  ('2c3c3609-b30f-4b9f-bfc8-b103272250e9', '415c2d30-28a8-4c43-a0c4-5a7be49601d8'),
  -- ♀ Małgorzata Rożniatowska → zastępuje: Małgorzata Zajączkowska
  ('415c2d30-28a8-4c43-a0c4-5a7be49601d8', 'd9294596-2fc1-4f0d-baae-bed5520bef58'),
  -- ♀ Małgorzata Zajączkowska → zastępuje: Maria Dębska
  ('d9294596-2fc1-4f0d-baae-bed5520bef58', '3580bcc3-73ea-4096-b504-95d2ab701145'),
  -- ♀ Maria Dębska → zastępuje: Maria Seweryn
  ('3580bcc3-73ea-4096-b504-95d2ab701145', '01004de0-3661-4074-9839-26c3c166be09'),
  -- ♀ Maria Seweryn → zastępuje: Michalina Łabacz
  ('01004de0-3661-4074-9839-26c3c166be09', 'd864f1e7-ba4b-47bb-bd05-454a573cbaf5'),
  -- ♀ Michalina Łabacz → zastępuje: Paulina Holtz
  ('d864f1e7-ba4b-47bb-bd05-454a573cbaf5', '5968c263-73d8-42b3-b24f-3969d44190b2'),
  -- ♀ Paulina Holtz → zastępuje: Sandra Korzeniak
  ('5968c263-73d8-42b3-b24f-3969d44190b2', '242ef25d-461f-40c9-aa08-15904c2ef8a7'),
  -- ♀ Sandra Korzeniak → zastępuje: Weronika Książkiewicz
  ('242ef25d-461f-40c9-aa08-15904c2ef8a7', 'd6fdb7d8-f7b4-45a9-a40e-cfb12e578d7b'),
  -- ♀ Weronika Książkiewicz → zastępuje: Agnieszka Skrzypczak
  ('d6fdb7d8-f7b4-45a9-a40e-cfb12e578d7b', '4b8d068d-30fc-4ec9-b0c6-8bfc81d6ea45'),
  -- ♂ Adam Krawczuk → zastępuje: Adam Serowaniec
  ('eb02e113-bd74-4544-9037-6459ac886403', '91ae3107-31fc-478d-95ed-86bb596fef23'),
  -- ♂ Adam Serowaniec → zastępuje: Adam Tomaszewski
  ('91ae3107-31fc-478d-95ed-86bb596fef23', '2a687145-c4d5-41b9-ac2c-9d239d3c6967'),
  -- ♂ Adam Tomaszewski → zastępuje: Adrian Brząkała
  ('2a687145-c4d5-41b9-ac2c-9d239d3c6967', '222ab58e-c948-48b8-9144-c2af80ad9bc5'),
  -- ♂ Adrian Brząkała → zastępuje: Andrzej Pieczyński
  ('222ab58e-c948-48b8-9144-c2af80ad9bc5', '2b43487b-cc80-4dbd-8e9a-20c22f12371e'),
  -- ♂ Andrzej Pieczyński → zastępuje: Andrzej Zieliński
  ('2b43487b-cc80-4dbd-8e9a-20c22f12371e', '4b89859f-a4fe-4109-8652-bd5b33b8fa23'),
  -- ♂ Andrzej Zieliński → zastępuje: Antoni Pawlicki
  ('4b89859f-a4fe-4109-8652-bd5b33b8fa23', '7e0c7984-7bd4-4ff8-b095-cac40e35f33f'),
  -- ♂ Antoni Pawlicki → zastępuje: Artur Barciś
  ('7e0c7984-7bd4-4ff8-b095-cac40e35f33f', '3630f5b8-fb34-48af-8734-c86239ef6c76'),
  -- ♂ Artur Barciś → zastępuje: Bartosz Waga
  ('3630f5b8-fb34-48af-8734-c86239ef6c76', '05a314aa-338f-4fa0-bd15-3d839251b501'),
  -- ♂ Bartosz Waga → zastępuje: Borys Szyc
  ('05a314aa-338f-4fa0-bd15-3d839251b501', '4adb39dd-0eb2-4b65-807f-1e9b679f0147'),
  -- ♂ Borys Szyc → zastępuje: Cezary Żak
  ('4adb39dd-0eb2-4b65-807f-1e9b679f0147', '535867ec-8103-4187-b3a7-c57764eeee0c'),
  -- ♂ Cezary Żak → zastępuje: Daniel Olbrychski
  ('535867ec-8103-4187-b3a7-c57764eeee0c', 'b87aa177-7d23-4367-aef3-2727cba2b0c1'),
  -- ♂ Daniel Olbrychski → zastępuje: Fabian Kocięcki
  ('b87aa177-7d23-4367-aef3-2727cba2b0c1', 'd3f33339-261c-4ffa-a099-31b40f7cd2c8'),
  -- ♂ Fabian Kocięcki → zastępuje: Filip Pławiak
  ('d3f33339-261c-4ffa-a099-31b40f7cd2c8', '663ecfd2-8eeb-4d2d-b00d-cd90b59b6790'),
  -- ♂ Filip Pławiak → zastępuje: Grzegorz Warchoł
  ('663ecfd2-8eeb-4d2d-b00d-cd90b59b6790', '917767d4-6bc8-44d9-87be-e6ac1b7c77e7'),
  -- ♂ Grzegorz Warchoł → zastępuje: Jan Englert
  ('917767d4-6bc8-44d9-87be-e6ac1b7c77e7', '470582ab-7932-464f-b4fc-abb49b05ee14'),
  -- ♂ Jan Englert → zastępuje: Jan Kowalski
  ('470582ab-7932-464f-b4fc-abb49b05ee14', 'd768ce28-d567-4f05-8ef6-d44eac6d2c94'),
  -- ♂ Jan Kowalski → zastępuje: Jan Malawski
  ('d768ce28-d567-4f05-8ef6-d44eac6d2c94', '3ec47776-6347-4e07-9033-14f9297997c8'),
  -- ♂ Jan Malawski → zastępuje: Jan Peszek
  ('3ec47776-6347-4e07-9033-14f9297997c8', '028a9313-d001-4511-90f3-a8dbe931b210'),
  -- ♂ Jan Peszek → zastępuje: Jarosław Boberek
  ('028a9313-d001-4511-90f3-a8dbe931b210', '6c8bb164-6581-4378-84ce-5b52e486a573'),
  -- ♂ Jarosław Boberek → zastępuje: Jędrzej Hycnar
  ('6c8bb164-6581-4378-84ce-5b52e486a573', '86747504-1c33-4043-88ce-2da3b8474027'),
  -- ♂ Jędrzej Hycnar → zastępuje: Kamil Maćkowiak
  ('86747504-1c33-4043-88ce-2da3b8474027', '5869b5f0-09e9-44f6-9114-68c771169f6f'),
  -- ♂ Kamil Maćkowiak → zastępuje: Karol Lelek
  ('5869b5f0-09e9-44f6-9114-68c771169f6f', 'd565c5cb-b4ed-40c5-8c04-206d0b4990de'),
  -- ♂ Karol Lelek → zastępuje: Krzysztof Dracz
  ('d565c5cb-b4ed-40c5-8c04-206d0b4990de', '05be38eb-ab06-4ed3-a82b-3629ceb68b6c'),
  -- ♂ Krzysztof Dracz → zastępuje: Krzysztof Stelmaszyk
  ('05be38eb-ab06-4ed3-a82b-3629ceb68b6c', '060720b3-2b54-4392-874f-3f1cc0f29b81'),
  -- ♂ Krzysztof Stelmaszyk → zastępuje: Maciej Wierzbicki
  ('060720b3-2b54-4392-874f-3f1cc0f29b81', 'da633c70-6c09-41e3-af62-5555fbc79cea'),
  -- ♂ Maciej Wierzbicki → zastępuje: Marcin Hycnar
  ('da633c70-6c09-41e3-af62-5555fbc79cea', '956ce213-8bf0-4fe1-805b-1d327b6d7b63'),
  -- ♂ Marcin Hycnar → zastępuje: Marcin Perchuć
  ('956ce213-8bf0-4fe1-805b-1d327b6d7b63', '78acedf9-19ce-4e25-bb7b-bde1c515c24e'),
  -- ♂ Marcin Perchuć → zastępuje: Michał Bajor
  ('78acedf9-19ce-4e25-bb7b-bde1c515c24e', '0d344e08-af70-437c-8b22-dbb8b40c0891'),
  -- ♂ Michał Bajor → zastępuje: Mirosław Kropielnicki
  ('0d344e08-af70-437c-8b22-dbb8b40c0891', '2c9c1eff-309c-4e8a-8bfd-b87a478511a8'),
  -- ♂ Mirosław Kropielnicki → zastępuje: Olgierd Łukaszewicz
  ('2c9c1eff-309c-4e8a-8bfd-b87a478511a8', '3a70805c-d077-4256-be21-4e78c193d149'),
  -- ♂ Olgierd Łukaszewicz → zastępuje: Paweł Ciołkosz
  ('3a70805c-d077-4256-be21-4e78c193d149', 'e26a714b-d48c-407c-9415-28b3d1477de4'),
  -- ♂ Paweł Ciołkosz → zastępuje: Piotr Grabowski
  ('e26a714b-d48c-407c-9415-28b3d1477de4', 'f403aa41-dbe6-4cf5-a7ab-acf59ae811c4'),
  -- ♂ Piotr Grabowski → zastępuje: Piotr Machalica
  ('f403aa41-dbe6-4cf5-a7ab-acf59ae811c4', '0c403399-9e27-4795-856e-ebbd1eb75a88'),
  -- ♂ Piotr Machalica → zastępuje: Radosław Luka
  ('0c403399-9e27-4795-856e-ebbd1eb75a88', 'e280b9c6-d591-44f1-b5cf-7adba56ff01e'),
  -- ♂ Radosław Luka → zastępuje: Rafał Rutkowski
  ('e280b9c6-d591-44f1-b5cf-7adba56ff01e', 'fa6edbc4-5a6c-436f-aac8-9ccab5f3b53d'),
  -- ♂ Rafał Rutkowski → zastępuje: Sławomir Holland
  ('fa6edbc4-5a6c-436f-aac8-9ccab5f3b53d', '9e8d32a9-9ce8-40f3-a49e-4fa87e3313e2'),
  -- ♂ Sławomir Holland → zastępuje: Szymon Majewski
  ('9e8d32a9-9ce8-40f3-a49e-4fa87e3313e2', '500b0480-3dfe-4209-91f8-ea56b757ee63'),
  -- ♂ Szymon Majewski → zastępuje: Tomasz Drabek
  ('500b0480-3dfe-4209-91f8-ea56b757ee63', '4f8efa90-53f1-4ccf-a427-a7710f0f17d1'),
  -- ♂ Tomasz Drabek → zastępuje: Tomasz Tyndyk
  ('4f8efa90-53f1-4ccf-a427-a7710f0f17d1', 'f4267b48-c55f-4927-8a8c-9ad72518b716'),
  -- ♂ Tomasz Tyndyk → zastępuje: Wojciech Malajkat
  ('f4267b48-c55f-4927-8a8c-9ad72518b716', 'b7b1200b-9596-4758-b71c-13a2ddcaa2e9'),
  -- ♂ Wojciech Malajkat → zastępuje: Zbigniew Zamachowski
  ('b7b1200b-9596-4758-b71c-13a2ddcaa2e9', '55e6fb59-3fda-4c89-a2a1-2908c6438d21'),
  -- ♂ Zbigniew Zamachowski → zastępuje: Adam Krawczuk
  ('55e6fb59-3fda-4c89-a2a1-2908c6438d21', 'eb02e113-bd74-4544-9037-6459ac886403');